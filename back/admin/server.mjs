import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const backRoot = fileURLToPath(new URL("..", import.meta.url));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

async function loadDotEnv() {
  try {
    const text = await readFile(join(backRoot, ".env"), "utf-8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await loadDotEnv();

const port = Number(process.env.ADMIN_PORT ?? 9231);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("ADMIN_PORT must be a valid port.");

const adminToken = process.env.WAR_ARCHIVE_ADMIN_TOKEN ?? "";
if (adminToken.length < 24) throw new Error("WAR_ARCHIVE_ADMIN_TOKEN must be set to at least 24 characters.");

const dataRoot = process.env.WAR_ARCHIVE_DATA_ROOT ?? "/data";
const distRoot = fileURLToPath(new URL("./dist", import.meta.url));
const topicsPath = process.env.WAR_ARCHIVE_TOPICS_PATH
  ?? fileURLToPath(new URL("../pipeline/config/topics.json", import.meta.url));
const collectionInterval = Number(process.env.COLLECTION_INTERVAL_MS ?? 10 * 60 * 1000);
const publicationInterval = Number(process.env.PUBLICATION_INTERVAL_MS ?? 60 * 60 * 1000);
const processingDelay = Number(process.env.PROCESSING_DELAY_MS ?? 10 * 60 * 1000);
const schedulerRetry = Number(process.env.SCHEDULER_RETRY_MS ?? 60 * 1000);

let runningCommand = null;
const commandHistory = [];

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function nextAt(lastSuccessAt, intervalMs) {
  const parsed = lastSuccessAt ? Date.parse(lastSuccessAt) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed + intervalMs).toISOString() : null;
}

function sourcesFrom(topics) {
  return topics.flatMap((topic) => Array.isArray(topic.sources) ? topic.sources : []);
}

async function loadStatus() {
  const [topics, collection, publication, history, raw, labeled, clustered, informationized, publishedArchive, reviewQueue] = await Promise.all([
    readJson(topicsPath, { topics: [] }),
    readJson(join(dataRoot, "state", "collection.json"), { collectedTopicIds: [] }),
    readJson(join(dataRoot, "state", "publication.json"), { publishedTopicIds: [] }),
    readJson(join(dataRoot, "state", "publication-history.json"), { entries: [] }),
    readJson(join(dataRoot, "raw", "documents.json"), { documents: [] }),
    readJson(join(dataRoot, "labeled", "documents.json"), { documents: [] }),
    readJson(join(dataRoot, "clustered", "documents.json"), { documents: [], clusters: [] }),
    readJson(join(dataRoot, "informationized", "records.json"), { items: [] }),
    readJson(join(dataRoot, "published", "archive.json"), { items: [] }),
    readJson(join(dataRoot, "review", "documents.json"), { documents: [] })
  ]);

  const topicItems = Array.isArray(topics.topics) ? topics.topics : [];
  const sourceItems = sourcesFrom(topicItems);
  const collectedIds = Array.isArray(collection.collectedTopicIds) ? collection.collectedTopicIds : [];
  const publishedIds = Array.isArray(publication.publishedTopicIds) ? publication.publishedTopicIds : [];
  const rawItems = Array.isArray(raw.documents) ? raw.documents : [];
  const labeledItems = Array.isArray(labeled.documents) ? labeled.documents : [];
  const clusteredItems = Array.isArray(clustered.documents) ? clustered.documents : [];
  const clusterItems = Array.isArray(clustered.clusters) ? clustered.clusters : [];
  const records = Array.isArray(informationized.items) ? informationized.items : [];
  const historyEntries = Array.isArray(history.entries) ? history.entries : [];
  const derivedReviewDocuments = clusteredItems.filter((document) =>
    document.qualityDecision === "review"
    || document.qualityDecision === "rejected"
    || document.outlier === true
    || Number(document.eventClusterConfidence ?? 0) < 0.6
  );
  const queuedReviewDocuments = Array.isArray(reviewQueue.documents) ? reviewQueue.documents : [];
  const reviewDocuments = queuedReviewDocuments.length > 0 ? queuedReviewDocuments : derivedReviewDocuments;
  const snapshotItems = Array.isArray(publishedArchive.items) ? publishedArchive.items : [];
  const latestPublishedArchive = [...historyEntries].reverse().find((entry) =>
    !entry.rolledBackAt && Array.isArray(entry.nextArchive?.items)
  )?.nextArchive?.items;
  const publishedRecords = snapshotItems.length > 0
    ? snapshotItems
    : Array.isArray(latestPublishedArchive) ? latestPublishedArchive : [];
  const publishedRecordIds = new Set(publishedRecords.map((record) => record.id));
  const publicationCountMismatch = publishedIds.length !== publishedRecords.length;

  return {
    checkedAt: new Date().toISOString(),
    security: {
      adminAuthRequired: true,
      tokenConfigured: true,
      credentialsExposed: false
    },
    schedules: {
      collectionIntervalMs: collectionInterval,
      processingDelayMs: processingDelay,
      publicationIntervalMs: publicationInterval,
      schedulerRetryMs: schedulerRetry,
      nextCollectionAt: nextAt(collection.lastCollectedAt, collectionInterval),
      nextPublicationAt: nextAt(publication.lastPublishedAt, publicationInterval)
    },
    publishing: {
      repository: process.env.GITHUB_FRONT_REPOSITORY ?? "kenitoa/warsachive",
      branch: process.env.GITHUB_FRONT_REF ?? "main",
      contentPath: process.env.GITHUB_FRONT_CONTENT_PATH ?? "web/content/archive.json",
      targetUrl: "https://kenitoa.github.io/warsachive/"
    },
    operations: {
      running: runningCommand ? {
        id: runningCommand.id,
        action: runningCommand.action,
        startedAt: runningCommand.startedAt
      } : null,
      recent: commandHistory.slice(-8).reverse()
    },
    errors: {
      collection: collection.lastError ?? null,
      publication: publication.lastError
        ?? (publicationCountMismatch
          ? `published state has ${publishedIds.length} records but the last verified archive has ${publishedRecords.length}.`
          : null)
    },
    counts: {
      topics: topicItems.length,
      collectedTopics: collectedIds.length,
      rawDocuments: rawItems.length,
      labeledDocuments: labeledItems.length,
      clusteredDocuments: clusteredItems.length,
      eventClusters: clusterItems.length,
      informationizedRecords: records.length,
      publishedRecords: publishedRecords.length
    },
    sources: {
      configured: sourceItems.length,
      activeApi: sourceItems.filter((source) => source.kind === "api-json" && !source.requiredEnv).length,
      requiresEnv: sourceItems.filter((source) => source.requiredEnv).length
    },
    quality: {
      minPublicationScore: Number(process.env.PUBLICATION_MIN_QUALITY_SCORE ?? 0.6),
      lowConfidenceDocuments: clusteredItems.filter((document) => Number(document.eventClusterConfidence ?? 0) < 0.6).length,
      outlierDocuments: clusteredItems.filter((document) => document.outlier === true).length,
      rejectedDocuments: clusteredItems.filter((document) => document.qualityDecision === "rejected").length,
      reviewDocuments: reviewDocuments.length
    },
    state: {
      lastCollectedAt: collection.lastCollectedAt ?? null,
      lastPublishedAt: publication.lastPublishedAt ?? null,
      pendingTopicId: publication.pendingTopicId ?? null,
      nextTopicId: topicItems.length > 0 ? "all-configured-sources" : null
    },
    clusters: clusterItems.slice(-12).reverse().map((cluster) => ({
      id: cluster.id,
      title: cluster.title,
      confidence: cluster.confidence,
      documentIds: cluster.documentIds ?? [],
      sentenceIds: cluster.sentenceIds ?? [],
      algorithm: cluster.algorithm,
      entityResolution: cluster.entityResolution
    })),
    reviewDocuments: [...reviewDocuments].reverse().map((document) => ({
      id: document.id,
      title: document.title,
      sourceUrl: document.sourceUrl,
      eventClusterId: document.eventClusterId,
      eventClusterTitle: document.eventClusterTitle,
      eventClusterConfidence: document.eventClusterConfidence,
      qualityScore: document.qualityScore,
      qualityDecision: document.qualityDecision,
      outlier: document.outlier,
      outlierReasons: document.outlierReasons ?? []
    })),
    publicationHistory: historyEntries.slice(-8).reverse().map((entry) => ({
      id: entry.id,
      action: entry.action,
      status: entry.status,
      recordId: entry.nextRecord?.id ?? entry.previousRecord?.id ?? null,
      addedDocumentIds: entry.change?.addedDocumentIds ?? [],
      removedDocumentIds: entry.change?.removedDocumentIds ?? [],
      createdAt: entry.createdAt
    })),
    recentRecords: records.slice(-5).reverse().map((record) => ({
      id: record.id,
      title: record.title,
      period: record.period,
      region: record.region,
      published: publishedRecordIds.has(record.id)
    }))
  };
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "no-referrer"
  });
  response.end(JSON.stringify(body));
}

function tokenFrom(request) {
  const authorization = request.headers.authorization ?? "";
  if (authorization.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  return request.headers["x-admin-token"]?.toString() ?? "";
}

function isAuthorized(request) {
  const supplied = tokenFrom(request);
  if (!supplied || supplied.length !== adminToken.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(adminToken));
}

function requireAuth(request, response) {
  if (isAuthorized(request)) return true;
  sendJson(response, 401, { error: "admin token required" });
  return false;
}

function sanitizeOutput(text) {
  return text
    .replace(/\b(?:github_pat|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, "[redacted-github-token]")
    .replace(/GITHUB_FRONT_TOKEN=([^\s]+)/g, "GITHUB_FRONT_TOKEN=[redacted]")
    .slice(-4000);
}

function runAction(action) {
  const definitions = {
    collect: ["run", "pipeline"],
    publish: ["run", "publish:once"],
    rollback: ["run", "rollback"],
    audit: ["run", "audit:sources"]
  };
  const args = definitions[action];
  if (!args) return Promise.reject(new Error(`unsupported action: ${action}`));
  if (runningCommand) return Promise.reject(new Error(`another action is already running: ${runningCommand.action}`));

  const entry = {
    id: `${Date.now()}-${action}`,
    action,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    output: ""
  };
  runningCommand = entry;
  commandHistory.push(entry);

  return new Promise((resolve) => {
    const child = spawn(npmCommand, args, {
      cwd: backRoot,
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const chunks = [];
    child.stdout.setEncoding("utf-8").on("data", (chunk) => chunks.push(chunk));
    child.stderr.setEncoding("utf-8").on("data", (chunk) => chunks.push(chunk));
    child.once("exit", (code) => {
      entry.status = code === 0 ? "completed" : "failed";
      entry.finishedAt = new Date().toISOString();
      entry.exitCode = code;
      entry.output = sanitizeOutput(chunks.join(""));
      runningCommand = null;
      resolve(entry);
    });
    child.once("error", (error) => {
      entry.status = "failed";
      entry.finishedAt = new Date().toISOString();
      entry.exitCode = -1;
      entry.output = sanitizeOutput(error instanceof Error ? error.message : String(error));
      runningCommand = null;
      resolve(entry);
    });
  });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        service: "war-archive-backend",
        checkedAt: new Date().toISOString()
      });
      return;
    }
    if (url.pathname === "/api/status") {
      if (!requireAuth(request, response)) return;
      sendJson(response, 200, await loadStatus());
      return;
    }
    if (url.pathname === "/api/actions" && request.method === "POST") {
      if (!requireAuth(request, response)) return;
      let body = "";
      for await (const chunk of request) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      const result = await runAction(payload.action);
      sendJson(response, result.status === "completed" ? 200 : 500, result);
      return;
    }

    const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
    let filePath = join(distRoot, safePath);
    try {
      if (!(await stat(filePath)).isFile()) filePath = join(distRoot, "index.html");
    } catch {
      filePath = join(distRoot, "index.html");
    }
    response.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=3600",
      "x-content-type-options": "nosniff",
      "x-frame-options": "SAMEORIGIN",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; frame-ancestors 'self'"
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "admin server error" });
  }
});

server.listen(port, "0.0.0.0", () => {
  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  console.log(`[admin] NAS process dashboard listening on 0.0.0.0:${boundPort}`);
});
