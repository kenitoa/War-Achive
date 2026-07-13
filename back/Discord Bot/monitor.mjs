import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const botRoot = dirname(fileURLToPath(import.meta.url));
const backRoot = join(botRoot, "..");

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

const dataRoot = process.env.WAR_ARCHIVE_DATA_ROOT ?? join(backRoot, ".local-data");
const logPath = process.env.DISCORD_MONITOR_LOG_PATH ?? join(botRoot, "logs", "monitoring.log");
const intervalMs = Number(process.env.MONITOR_INTERVAL_MS ?? 60_000);
const failureThreshold = Number(process.env.MONITOR_FAILURE_THRESHOLD ?? 3);
const webhookUrl = process.env.DISCORD_WEBHOOK_URL ?? "";
const botToken = process.env.DISCORD_BOT_TOKEN ?? "";
const channelId = process.env.DISCORD_CHANNEL_ID ?? "";
const discordApiBase = process.env.DISCORD_API_BASE_URL ?? "https://discord.com/api/v10";
const discordGatewayUrl = process.env.DISCORD_GATEWAY_URL ?? "wss://gateway.discord.gg/?v=10&encoding=json";
const discordGatewayEnabled = process.env.DISCORD_GATEWAY_ENABLED !== "false";
const discordDeliveryMode = botToken && channelId ? "bot" : webhookUrl ? "webhook" : "none";

const issueCatalog = {
  COLLECTION_FAILED: {
    severity: "critical",
    causes: ["source timeout", "API schema change", "robots/compliance rejection", "invalid topics.json", "network/DNS failure"],
    fixes: ["run npm run audit:sources", "check the failing source URL and compliance fields", "reduce source max items temporarily", "inspect raw collection logs"]
  },
  PUBLISH_FAILED_AUTH: {
    severity: "critical",
    causes: ["expired fine-grained token", "wrong repository selection", "missing Contents read/write permission"],
    fixes: ["rotate GITHUB_FRONT_TOKEN", "grant only kenitoa/warsachive Contents Read and write", "run npm run verify:secrets"]
  },
  PUBLISH_FAILED_CONFLICT: {
    severity: "warning",
    causes: ["archive.json changed between read and write", "parallel publisher run", "manual GitHub edit"],
    fixes: ["wait for next retry", "stop duplicate publishers", "compare publication-history.json before rollback"]
  },
  PUBLISH_FAILED_RATE_LIMIT: {
    severity: "warning",
    causes: ["GitHub REST primary or secondary rate limit", "too many content writes"],
    fixes: ["wait for x-ratelimit-reset/retry-after", "increase publication interval", "batch more records per write only after review"]
  },
  PUBLISH_FAILED_VALIDATION: {
    severity: "critical",
    causes: ["invalid archive JSON", "branch protection", "invalid path", "malformed commit body"],
    fixes: ["run npm test", "check branch protection and GITHUB_FRONT_CONTENT_PATH", "use admin rollback if a bad archive was pushed"]
  },
  COLLECTOR_STALLED: {
    severity: "critical",
    causes: ["collector process stopped", "scheduler loop blocked", "data volume permission problem"],
    fixes: ["restart docker compose service", "check collection.json timestamps", "inspect container health and logs"]
  },
  PUBLISHER_STALLED: {
    severity: "critical",
    causes: ["publisher process stopped", "pending record stuck", "GitHub API write blocked"],
    fixes: ["open admin dashboard", "run publish once", "run rollback if pending archive is bad"]
  },
  LOW_QUALITY_SPIKE: {
    severity: "warning",
    causes: ["new source has poor metadata", "OCR/noisy text", "wrong source topic", "entity resolution drift"],
    fixes: ["review admin queue", "adjust source reliability", "split or disable noisy source", "inspect outlier reasons"]
  },
  URL_UPDATES_DETECTED: {
    severity: "info",
    causes: ["same URL content changed", "source corrected metadata", "new sentences added to an existing item"],
    fixes: ["confirm changedFragments", "verify updated cluster record", "publish will overwrite same archive item when fingerprint changes"]
  },
  DISCORD_DESTINATION_MISSING: {
    severity: "info",
    causes: ["DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID not configured", "DISCORD_WEBHOOK_URL fallback not configured"],
    fixes: ["set DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID in back/.env", "invite the bot to the Discord server with Send Messages permission", "logs still remain in Discord Bot/logs/monitoring.log"]
  },
  DISCORD_BOT_CONFIG_INCOMPLETE: {
    severity: "warning",
    causes: ["only one of DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID is configured"],
    fixes: ["set both DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID", "or remove both and use DISCORD_WEBHOOK_URL fallback"]
  },
  DISCORD_DELIVERY_FAILED: {
    severity: "warning",
    causes: ["bot token expired or revoked", "bot is not invited to the server", "missing Send Messages permission", "invalid channel ID", "Discord API outage"],
    fixes: ["rotate DISCORD_BOT_TOKEN if exposed", "invite the bot with Send Messages permission", "verify DISCORD_CHANNEL_ID", "check Discord API status"]
  },
  DISCORD_GATEWAY_FAILED: {
    severity: "warning",
    causes: ["bot token expired or revoked", "Discord Gateway blocked by network", "Discord Gateway outage", "runtime WebSocket support unavailable"],
    fixes: ["rotate DISCORD_BOT_TOKEN if exposed", "run the monitor as a long-running process", "check NAS outbound websocket access", "set DISCORD_GATEWAY_ENABLED=false only if online presence is not required"]
  }
};

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await readFile(join(dataRoot, relativePath), "utf-8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function ageMs(value) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? Date.now() - parsed : Infinity;
}

function classifyPublicationError(message) {
  if (/401|bad credentials|expired|token/i.test(message)) return "PUBLISH_FAILED_AUTH";
  if (/403|429|rate limit|secondary limit/i.test(message)) return "PUBLISH_FAILED_RATE_LIMIT";
  if (/409|conflict/i.test(message)) return "PUBLISH_FAILED_CONFLICT";
  if (/422|protected branch|validation|invalid/i.test(message)) return "PUBLISH_FAILED_VALIDATION";
  return "PUBLISH_FAILED_VALIDATION";
}

function issue(code, detail = {}) {
  const catalog = issueCatalog[code];
  return {
    code,
    severity: catalog.severity,
    checkedAt: new Date().toISOString(),
    detail,
    possibleCauses: catalog.causes,
    recommendedFixes: catalog.fixes
  };
}

async function detectIssues() {
  const [collection, publication, raw, clustered] = await Promise.all([
    readJson("state/collection.json", {}),
    readJson("state/publication.json", {}),
    readJson("raw/documents.json", { documents: [] }),
    readJson("clustered/documents.json", { documents: [] })
  ]);
  const issues = [];
  const collectionInterval = Number(process.env.COLLECTION_INTERVAL_MS ?? 600_000);
  const publicationInterval = Number(process.env.PUBLICATION_INTERVAL_MS ?? 3_600_000);
  const processingDelay = Number(process.env.PROCESSING_DELAY_MS ?? 600_000);

  if ((botToken && !channelId) || (!botToken && channelId)) issues.push(issue("DISCORD_BOT_CONFIG_INCOMPLETE"));
  if (discordDeliveryMode === "none") issues.push(issue("DISCORD_DESTINATION_MISSING"));
  if (collection.lastError) issues.push(issue("COLLECTION_FAILED", { message: collection.lastError }));
  if (publication.lastError) issues.push(issue(classifyPublicationError(publication.lastError), { message: publication.lastError }));
  if (ageMs(collection.lastCollectedAt) > collectionInterval * failureThreshold) {
    issues.push(issue("COLLECTOR_STALLED", { lastCollectedAt: collection.lastCollectedAt ?? null, thresholdMs: collectionInterval * failureThreshold }));
  }
  if (ageMs(publication.lastPublishedAt) > (publicationInterval + processingDelay) * failureThreshold) {
    issues.push(issue("PUBLISHER_STALLED", { lastPublishedAt: publication.lastPublishedAt ?? null, thresholdMs: (publicationInterval + processingDelay) * failureThreshold }));
  }

  const documents = Array.isArray(clustered.documents) ? clustered.documents : [];
  const rejected = documents.filter((document) => document.qualityDecision === "rejected" || document.outlier === true);
  if (documents.length > 0 && rejected.length / documents.length >= 0.25) {
    issues.push(issue("LOW_QUALITY_SPIKE", { rejected: rejected.length, total: documents.length }));
  }
  const updated = (Array.isArray(raw.documents) ? raw.documents : []).filter((document) => document.changeKind === "updated");
  if (updated.length > 0) {
    issues.push(issue("URL_UPDATES_DETECTED", {
      count: updated.length,
      documents: updated.slice(-5).map((document) => ({
        id: document.id,
        sourceUrl: document.sourceUrl,
        fragments: document.changeSummary?.addedFragments?.length ?? 0
      }))
    }));
  }
  return issues;
}

function formatIssue(item) {
  return [
    `[${item.checkedAt}] ${item.severity.toUpperCase()} ${item.code}`,
    `detail=${JSON.stringify(item.detail)}`,
    `possibleCauses=${item.possibleCauses.join(" | ")}`,
    `recommendedFixes=${item.recommendedFixes.join(" | ")}`
  ].join("\n");
}

async function appendLog(issues) {
  await mkdir(dirname(logPath), { recursive: true });
  const line = issues.length > 0
    ? issues.map(formatIssue).join("\n---\n")
    : `[${new Date().toISOString()}] OK no active monitoring issues`;
  await writeFile(logPath, `${line}\n\n`, { flag: "a" });
  console.log(line);
}

function discordPayload(issues) {
  const critical = issues.filter((item) => item.severity === "critical");
  const content = issues.slice(0, 6).map((item) => `**${item.severity.toUpperCase()} ${item.code}**\n${item.recommendedFixes.slice(0, 3).map((fix) => `- ${fix}`).join("\n")}`).join("\n\n");
  return {
    content: critical.length > 0 ? `War Archive critical issue count: ${critical.length}` : "War Archive monitoring notice",
    embeds: [{ title: "War Archive monitor", description: content.slice(0, 3900), color: critical.length > 0 ? 0x8c392f : 0x71806c }]
  };
}

async function fetchDiscord(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord API ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }
}

async function sendDiscordWithBot(issues) {
  if (!botToken || !channelId || issues.length === 0) return;
  await fetchDiscord(`${discordApiBase}/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    headers: { authorization: `Bot ${botToken}`, "content-type": "application/json" },
    body: JSON.stringify(discordPayload(issues))
  });
}

async function sendDiscordWithWebhook(issues) {
  if (!webhookUrl || issues.length === 0) return;
  await fetchDiscord(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...discordPayload(issues),
      username: "War Archive Monitor",
    })
  });
}

async function sendDiscord(issues) {
  if (issues.length === 0) return;
  try {
    if (discordDeliveryMode === "bot") await sendDiscordWithBot(issues);
    else if (discordDeliveryMode === "webhook") await sendDiscordWithWebhook(issues);
  } catch (error) {
    await appendLog([issue("DISCORD_DELIVERY_FAILED", { message: `discord ${discordDeliveryMode} delivery failed: ${error instanceof Error ? error.message : String(error)}` })]);
  }
}

function parseGatewayMessage(data) {
  if (typeof data === "string") return JSON.parse(data);
  if (data instanceof ArrayBuffer) return JSON.parse(Buffer.from(data).toString("utf-8"));
  return JSON.parse(Buffer.from(data).toString("utf-8"));
}

function startDiscordGateway() {
  if (!discordGatewayEnabled || !botToken) return { stop: () => undefined };
  if (typeof WebSocket !== "function") {
    void appendLog([issue("DISCORD_GATEWAY_FAILED", { message: "WebSocket is not available in this Node runtime" })]);
    return { stop: () => undefined };
  }

  let stopped = false;
  let sequence = null;
  let socket = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;

  const cleanup = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    socket = null;
  };

  const scheduleReconnect = (reason) => {
    cleanup();
    if (stopped) return;
    void appendLog([issue("DISCORD_GATEWAY_FAILED", { message: reason })]);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 30_000);
  };

  const sendGateway = (payload) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };

  const heartbeat = () => sendGateway({ op: 1, d: sequence });

  const identify = () => sendGateway({
    op: 2,
    d: {
      token: botToken,
      intents: 0,
      properties: {
        os: process.platform,
        browser: "war-archive-monitor",
        device: "war-archive-monitor"
      },
      presence: {
        status: "online",
        afk: false,
        activities: [{ name: "War Archive monitor", type: 3 }]
      }
    }
  });

  function connect() {
    if (stopped) return;
    try {
      socket = new WebSocket(discordGatewayUrl);
    } catch (error) {
      scheduleReconnect(`discord gateway create failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    socket.addEventListener("message", (event) => {
      try {
        const packet = parseGatewayMessage(event.data);
        if (typeof packet.s === "number") sequence = packet.s;
        if (packet.op === 10) {
          const interval = Number(packet.d?.heartbeat_interval ?? 41_250);
          heartbeat();
          heartbeatTimer = setInterval(heartbeat, interval);
          identify();
        } else if (packet.op === 7) {
          scheduleReconnect("discord gateway requested reconnect");
        } else if (packet.op === 9) {
          sequence = null;
          scheduleReconnect("discord gateway invalid session");
        } else if (packet.t === "READY") {
          console.log(`[monitor] Discord Gateway online as ${packet.d?.user?.username ?? "bot"}`);
        }
      } catch (error) {
        void appendLog([issue("DISCORD_GATEWAY_FAILED", { message: `discord gateway message failed: ${error instanceof Error ? error.message : String(error)}` })]);
      }
    });

    socket.addEventListener("error", () => {
      scheduleReconnect("discord gateway websocket error");
    });

    socket.addEventListener("close", (event) => {
      scheduleReconnect(`discord gateway closed: ${event.code} ${event.reason || "no reason"}`);
    });
  }

  connect();
  return {
    stop: () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const currentSocket = socket;
      cleanup();
      if (currentSocket?.readyState === WebSocket.OPEN || currentSocket?.readyState === WebSocket.CONNECTING) currentSocket.close(1000, "monitor stopped");
    }
  };
}

async function runOnce() {
  const issues = await detectIssues();
  await appendLog(issues);
  await sendDiscord(issues.filter((item) => !item.code.startsWith("DISCORD_")));
  return issues;
}

if (process.argv.includes("--once")) {
  await runOnce();
} else {
  const gateway = startDiscordGateway();
  process.once("SIGINT", () => {
    gateway.stop();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    gateway.stop();
    process.exit(0);
  });
  console.log(`[monitor] Discord Bot monitoring started. interval=${intervalMs}ms log=${logPath} delivery=${discordDeliveryMode} gateway=${discordGatewayEnabled && botToken ? "enabled" : "disabled"}`);
  while (true) {
    await runOnce();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
