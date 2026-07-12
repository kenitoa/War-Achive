import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.ADMIN_PORT ?? 9231);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("ADMIN_PORT가 올바르지 않습니다.");

const dataRoot = process.env.WAR_ARCHIVE_DATA_ROOT ?? "/data";
const distRoot = fileURLToPath(new URL("./dist", import.meta.url));
const topicsPath = process.env.WAR_ARCHIVE_TOPICS_PATH
  ?? fileURLToPath(new URL("../pipeline/config/topics.json", import.meta.url));
const collectionInterval = Number(process.env.COLLECTION_INTERVAL_MS ?? 30 * 60 * 1000);
const publicationInterval = Number(process.env.PUBLICATION_INTERVAL_MS ?? 40 * 60 * 1000);
const processingDelay = Number(process.env.PROCESSING_DELAY_MS ?? 10 * 60 * 1000);

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

async function loadStatus() {
  const [topics, collection, publication, raw, labeled, informationized] = await Promise.all([
    readJson(topicsPath, { topics: [] }),
    readJson(join(dataRoot, "state", "collection.json"), { collectedTopicIds: [] }),
    readJson(join(dataRoot, "state", "publication.json"), { publishedTopicIds: [] }),
    readJson(join(dataRoot, "raw", "documents.json"), { documents: [] }),
    readJson(join(dataRoot, "labeled", "documents.json"), { documents: [] }),
    readJson(join(dataRoot, "informationized", "records.json"), { items: [] })
  ]);
  const topicItems = Array.isArray(topics.topics) ? topics.topics : [];
  const collectedIds = Array.isArray(collection.collectedTopicIds) ? collection.collectedTopicIds : [];
  const publishedIds = Array.isArray(publication.publishedTopicIds) ? publication.publishedTopicIds : [];
  const rawItems = Array.isArray(raw.documents) ? raw.documents : [];
  const labeledItems = Array.isArray(labeled.documents) ? labeled.documents : [];
  const records = Array.isArray(informationized.items) ? informationized.items : [];
  return {
    checkedAt: new Date().toISOString(),
    schedules: {
      collectionIntervalMs: collectionInterval,
      processingDelayMs: processingDelay,
      publicationIntervalMs: publicationInterval,
      nextCollectionAt: nextAt(collection.lastCollectedAt, collectionInterval),
      nextPublicationAt: nextAt(publication.lastPublishedAt, publicationInterval)
    },
    counts: {
      topics: topicItems.length,
      collectedTopics: collectedIds.length,
      rawDocuments: rawItems.length,
      labeledDocuments: labeledItems.length,
      informationizedRecords: records.length,
      publishedRecords: publishedIds.length
    },
    state: {
      lastCollectedAt: collection.lastCollectedAt ?? null,
      lastPublishedAt: publication.lastPublishedAt ?? null,
      pendingTopicId: publication.pendingTopicId ?? null,
      nextTopicId: topicItems.length > 0 ? "all-configured-sources" : null
    },
    recentRecords: records.slice(-5).reverse().map((record) => ({
      id: record.id,
      title: record.title,
      period: record.period,
      region: record.region,
      published: publishedIds.includes(record.id)
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
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
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
      sendJson(response, 200, await loadStatus());
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
      "x-frame-options": "SAMEORIGIN"
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "관리 화면 오류" });
  }
});

server.listen(port, "0.0.0.0", () => {
  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  console.log(`[admin] NAS process dashboard listening on 0.0.0.0:${boundPort}`);
});
