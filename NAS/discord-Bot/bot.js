const fs = require("node:fs/promises");
const path = require("node:path");
const {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

const TOKEN = cleanToken(process.env.DISCORD_BOT_TOKEN);
const STATUS_CHANNEL_ID = process.env.DISCORD_STATUS_CHANNEL_ID || "";
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const ALERT_ROLE_ID = process.env.DISCORD_ALERT_ROLE_ID || "";
const HEALTH_URL = process.env.WAR_ARCHIVE_HEALTH_URL || "http://127.0.0.1:8080/health";
const PUBLIC_URL = process.env.WAR_ARCHIVE_PUBLIC_URL || "http://127.0.0.1:8080";
const BASE_URL = process.env.WAR_ARCHIVE_BASE_URL || PUBLIC_URL;
const FRONT_DATA_DIR = process.env.FRONT_DATA_DIR || path.resolve(__dirname, "..", "front", "data");
const CRAWLER_DATA_DIR = process.env.CRAWLER_DATA_DIR || path.resolve(__dirname, "..", "back", "crowling", "data");
const MONITOR_INTERVAL_SECONDS = positiveNumber(process.env.MONITOR_INTERVAL_SECONDS, 60);
const MONITOR_FAILURE_THRESHOLD = positiveNumber(process.env.MONITOR_FAILURE_THRESHOLD, 1);
const REQUEST_TIMEOUT_MS = positiveNumber(process.env.MONITOR_REQUEST_TIMEOUT_MS, 5000);
const STALE_DATA_HOURS = positiveNumber(process.env.MONITOR_STALE_DATA_HOURS, 48);
const ANNOUNCE_ON_STARTUP = parseBoolean(process.env.DISCORD_ANNOUNCE_ON_STARTUP, true);
const STARTUP_PANEL_ENABLED = parseBoolean(process.env.DISCORD_STARTUP_PANEL, true);
const EXTRA_ROUTE_PATHS = splitCsv(process.env.MONITOR_EXTRA_ROUTE_PATHS || "");

if (!TOKEN) {
  console.error("DISCORD_BOT_TOKEN is required.");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("war-status")
    .setDescription("War Archive 전체 모니터링 항목을 확인합니다."),
  new SlashCommandBuilder()
    .setName("war-health")
    .setDescription("백엔드 헬스체크와 Discord 모니터 설정을 확인합니다."),
  new SlashCommandBuilder()
    .setName("war-pages")
    .setDescription("War Archive 주요 페이지와 API 경로 상태를 확인합니다."),
  new SlashCommandBuilder()
    .setName("war-data")
    .setDescription("프론트 데이터, JSON, 검색 인덱스 상태를 확인합니다."),
  new SlashCommandBuilder()
    .setName("war-crawler")
    .setDescription("크롤러 DB와 수집 대상 파일 상태를 확인합니다."),
  new SlashCommandBuilder()
    .setName("war-monitor")
    .setDescription("자동 모니터링 설정과 마지막 체크 결과를 확인합니다."),
  new SlashCommandBuilder()
    .setName("war-publish")
    .setDescription("현재 전체 상태를 설정된 상태 채널에 게시합니다."),
  new SlashCommandBuilder()
    .setName("war-issues")
    .setDescription("현재 WARN/FAIL 항목만 모아서 확인합니다."),
  new SlashCommandBuilder()
    .setName("war-probe")
    .setDescription("War Archive 내부 경로 하나를 즉시 확인합니다.")
    .addStringOption((option) =>
      option
        .setName("path")
        .setDescription("확인할 경로입니다. 예: /pages/war overview/war overview.html")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("war-latency")
    .setDescription("백엔드 /health 응답 시간을 여러 번 측정합니다.")
    .addIntegerOption((option) =>
      option
        .setName("samples")
        .setDescription("측정 횟수입니다. 기본 5회, 최대 10회")
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("war-alert-test")
    .setDescription("상태 채널로 테스트 알림 패널을 보냅니다."),
  new SlashCommandBuilder()
    .setName("war-watch")
    .setDescription("자동 모니터링을 제어합니다.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("pause")
        .setDescription("자동 주기 체크를 일시정지합니다."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("resume")
        .setDescription("자동 주기 체크를 다시 시작합니다."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("자동 주기 체크 동작 여부를 확인합니다."),
    ),
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const EXPECTED_DATA_DIRS = [
  "war overview data",
  "biography of people data",
  "weapons and equipment data",
  "strategy and tactics data",
  "Historical Sources & Documents data",
  "Battlefield Map data",
  "Undefine facts data",
  "search",
];

const CORE_ROUTE_CHECKS = [
  { name: "홈", path: "/", expected: [200] },
  { name: "전쟁 개요", path: "/pages/war overview/war overview.html", expected: [200] },
  { name: "인물", path: "/pages/biography of people/biography of people.html", expected: [200] },
  { name: "무기/장비", path: "/pages/Weapons and Equipment/Weapons and Equipment.html", expected: [200] },
  { name: "전략/전술", path: "/pages/strategy and tactics/strategy and tactics.html", expected: [200] },
  { name: "사료/문서", path: "/pages/Historical Sources & Documents/Historical Sources & Documents.html", expected: [200] },
  { name: "전장 지도", path: "/pages/Battlefield Map/Battlefield Map.html", expected: [200] },
  { name: "미정의 사실", path: "/pages/Undefine facts/Undefine facts.html", expected: [200] },
  { name: "내 아카이브", path: "/pages/My Archive/My Archive.html", expected: [200] },
  { name: "계정 API", path: "/api/auth/me", expected: [401] },
];

let lastCheck = null;
let lastNotifiedState = "";
let failureStreak = 0;
let monitorTimer;
let monitorEnabled = true;
let commandRegistration = {
  ok: false,
  detail: "not attempted",
  scope: "unknown",
};

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanToken(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^Bot\s+/i, "")
    .trim();
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function splitCsv(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function discordTimestamp(date = new Date()) {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function ageHours(date) {
  if (!date) return Infinity;
  return (Date.now() - date.getTime()) / 36e5;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function icon(status) {
  if (status === "fail") return "FAIL";
  if (status === "warn") return "WARN";
  return "OK";
}

function buildUrl(routePath) {
  return new URL(routePath, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`).toString();
}

function checkItem(name, status, detail, meta = {}) {
  return { name, status, detail: String(detail || "-"), ...meta };
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") return "응답 본문 없음";
  const parts = [];
  if (Object.prototype.hasOwnProperty.call(payload, "ok")) parts.push(`ok=${payload.ok}`);
  if (payload.service) parts.push(`service=${payload.service}`);
  if (Object.prototype.hasOwnProperty.call(payload, "authStoreReady")) {
    parts.push(`authStoreReady=${payload.authStoreReady}`);
  }
  return parts.length ? parts.join(", ") : JSON.stringify(payload).slice(0, 180);
}

async function fetchJsonOrText(url) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json,text/html;q=0.9,*/*;q=0.8" },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    return {
      ok: response.ok,
      statusCode: response.status,
      latencyMs: Date.now() - startedAt,
      payload,
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      latencyMs: Date.now() - startedAt,
      payload: null,
      error: error.name === "AbortError" ? `timeout ${REQUEST_TIMEOUT_MS}ms` : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkBackendHealth() {
  const result = await fetchJsonOrText(HEALTH_URL);
  if (!result.statusCode) {
    return {
      result,
      item: checkItem("백엔드 /health", "fail", `${result.error}, ${result.latencyMs}ms`),
    };
  }

  const payloadOk = typeof result.payload !== "object" || result.payload.ok !== false;
  const authReady = typeof result.payload === "object" ? result.payload.authStoreReady : undefined;
  const status = result.ok && payloadOk ? (authReady === false ? "warn" : "ok") : "fail";
  const detailParts = [`HTTP ${result.statusCode}`, `${result.latencyMs}ms`, summarizePayload(result.payload)];
  if (authReady === false) detailParts.push("MySQL/auth store 준비 안 됨");

  return {
    result,
    item: checkItem("백엔드 /health", status, detailParts.join(" | ")),
  };
}

async function checkRoute(route) {
  const url = buildUrl(route.path);
  const result = await fetchJsonOrText(url);
  if (!result.statusCode) {
    return checkItem(route.name, "fail", `${route.path} | ${result.error}`);
  }

  const expected = route.expected || [200];
  const status = expected.includes(result.statusCode) ? "ok" : "fail";
  return checkItem(route.name, status, `${route.path} | HTTP ${result.statusCode} | ${result.latencyMs}ms`);
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function listFilesRecursive(rootDir) {
  const files = [];

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files;
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function checkFrontData() {
  const items = [];
  const rootStat = await statIfExists(FRONT_DATA_DIR);
  if (!rootStat || !rootStat.isDirectory()) {
    return [checkItem("프론트 데이터", "fail", `${FRONT_DATA_DIR} 경로 없음`)];
  }

  const missingDirs = [];
  const categoryLines = [];
  for (const dirName of EXPECTED_DATA_DIRS) {
    const dirPath = path.join(FRONT_DATA_DIR, dirName);
    const dirStat = await statIfExists(dirPath);
    if (!dirStat || !dirStat.isDirectory()) {
      missingDirs.push(dirName);
      continue;
    }
    const files = await listFilesRecursive(dirPath);
    const jsonCount = files.filter((file) => file.toLowerCase().endsWith(".json")).length;
    categoryLines.push(`${dirName}: ${jsonCount}`);
  }
  items.push(
    checkItem(
      "데이터 카테고리",
      missingDirs.length ? "fail" : "ok",
      missingDirs.length ? `누락: ${missingDirs.join(", ")}` : categoryLines.join(" | "),
    ),
  );

  const allFiles = await listFilesRecursive(FRONT_DATA_DIR);
  const jsonFiles = allFiles.filter((file) => file.toLowerCase().endsWith(".json"));
  const invalidJson = [];
  for (const file of jsonFiles) {
    try {
      await readJsonFile(file);
    } catch (error) {
      invalidJson.push(`${path.relative(FRONT_DATA_DIR, file)} (${error.message})`);
      if (invalidJson.length >= 5) break;
    }
  }
  items.push(
    checkItem(
      "JSON 무결성",
      invalidJson.length ? "fail" : "ok",
      invalidJson.length ? invalidJson.join(" | ") : `${jsonFiles.length}개 JSON 파싱 성공`,
    ),
  );

  const searchDir = path.join(FRONT_DATA_DIR, "search");
  const searchFiles = (await statIfExists(searchDir)) ? (await fs.readdir(searchDir)).filter((name) => name.endsWith(".json")) : [];
  items.push(
    checkItem(
      "검색 인덱스",
      searchFiles.length >= 7 ? "ok" : "warn",
      `${searchFiles.length}개 인덱스 파일`,
    ),
  );

  const statusIndex = path.join(FRONT_DATA_DIR, "Undefine facts data", "Data status", "status-index.json");
  try {
    const parsed = await readJsonFile(statusIndex);
    const categories = parsed.categories ? Object.keys(parsed.categories).length : 0;
    const statusItems = Array.isArray(parsed.items) ? parsed.items.length : 0;
    items.push(checkItem("미정의 사실 상태판", "ok", `카테고리 ${categories}개, 항목 ${statusItems}개`));
  } catch (error) {
    items.push(checkItem("미정의 사실 상태판", "fail", `status-index.json 오류: ${error.message}`));
  }

  return items;
}

async function checkCrawlerData() {
  const items = [];
  const rootStat = await statIfExists(CRAWLER_DATA_DIR);
  if (!rootStat || !rootStat.isDirectory()) {
    return [checkItem("크롤러 데이터", "fail", `${CRAWLER_DATA_DIR} 경로 없음`)];
  }

  const databasePath = path.join(CRAWLER_DATA_DIR, "articles.sqlite3");
  const databaseStat = await statIfExists(databasePath);
  if (!databaseStat || !databaseStat.isFile()) {
    items.push(checkItem("크롤러 DB", "fail", "articles.sqlite3 없음"));
  } else {
    const stale = ageHours(databaseStat.mtime) > STALE_DATA_HOURS;
    items.push(
      checkItem(
        "크롤러 DB",
        stale ? "warn" : "ok",
        `${formatBytes(databaseStat.size)} | 수정 ${discordTimestamp(databaseStat.mtime)}`,
      ),
    );
  }

  const targetsPath = path.join(CRAWLER_DATA_DIR, "target-sites.json");
  try {
    const targets = await readJsonFile(targetsPath);
    const count = Array.isArray(targets) ? targets.length : Array.isArray(targets.sites) ? targets.sites.length : 0;
    items.push(checkItem("크롤링 대상", count ? "ok" : "warn", `${count}개 대상 사이트`));
  } catch (error) {
    items.push(checkItem("크롤링 대상", "fail", `target-sites.json 오류: ${error.message}`));
  }

  return items;
}

async function checkWarArchive() {
  const checkedAt = new Date();
  const startedAt = Date.now();
  const checks = [];

  const health = await checkBackendHealth();
  checks.push(health.item);

  const routeChecks = [...CORE_ROUTE_CHECKS];
  for (const extraPath of EXTRA_ROUTE_PATHS) {
    routeChecks.push({ name: `추가 경로 ${extraPath}`, path: extraPath, expected: [200] });
  }
  checks.push(...(await Promise.all(routeChecks.map(checkRoute))));
  checks.push(...(await checkFrontData()));
  checks.push(...(await checkCrawlerData()));

  checks.push(
    checkItem(
      "Discord 설정",
      STATUS_CHANNEL_ID ? "ok" : "warn",
      `채널 ${STATUS_CHANNEL_ID ? "설정됨" : "미설정"} | 서버 명령 ${GUILD_ID ? "길드" : "전역"} | 알림 역할 ${
        ALERT_ROLE_ID ? "설정됨" : "없음"
      }`,
    ),
  );

  const failCount = checks.filter((item) => item.status === "fail").length;
  const warnCount = checks.filter((item) => item.status === "warn").length;
  const okCount = checks.filter((item) => item.status === "ok").length;
  const state = failCount ? "fail" : warnCount ? "warn" : "ok";

  return {
    ok: failCount === 0,
    state,
    checkedAt,
    latencyMs: Date.now() - startedAt,
    statusCode: health.result.statusCode,
    payload: health.result.payload,
    error: health.result.error,
    checks,
    counts: { ok: okCount, warn: warnCount, fail: failCount },
  };
}

function buildSectionLines(checks) {
  return checks.map((item) => `${icon(item.status)} ${item.name}: ${item.detail}`);
}

function countChecks(checks) {
  return {
    ok: checks.filter((item) => item.status === "ok").length,
    warn: checks.filter((item) => item.status === "warn").length,
    fail: checks.filter((item) => item.status === "fail").length,
  };
}

function stateFromCounts(counts) {
  if (counts.fail) return "fail";
  if (counts.warn) return "warn";
  return "ok";
}

function colorForState(state) {
  if (state === "fail") return 0xe74c3c;
  if (state === "warn") return 0xf1c40f;
  return 0x2ecc71;
}

function textForState(state) {
  if (state === "fail") return "장애";
  if (state === "warn") return "주의";
  return "정상";
}

function chunkLines(lines, maxLength = 950) {
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const line of lines) {
    const lineLength = line.length + 1;
    if (current.length && currentLength + lineLength > maxLength) {
      chunks.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += lineLength;
  }

  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

function summaryEmbed(result, title = "War Archive 전체 상태", description = "Discord 봇이 확인 가능한 War Archive 운영 항목입니다.") {
  const color = colorForState(result.state);
  const stateText = textForState(result.state);
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription(description)
    .addFields(
      { name: "종합 상태", value: stateText, inline: true },
      { name: "체크 수", value: `OK ${result.counts.ok} / WARN ${result.counts.warn} / FAIL ${result.counts.fail}`, inline: true },
      { name: "소요 시간", value: `${result.latencyMs}ms`, inline: true },
      { name: "접속 주소", value: PUBLIC_URL, inline: false },
      { name: "검사 기준 주소", value: BASE_URL, inline: false },
      { name: "헬스체크", value: HEALTH_URL, inline: false },
      { name: "확인 시각", value: discordTimestamp(result.checkedAt), inline: false },
    )
    .setFooter({ text: result.error ? `원인: ${result.error}` : "War Archive Discord monitor" });
}

function filteredResult(result, checks) {
  const counts = countChecks(checks);
  return {
    ...result,
    checks,
    counts,
    state: stateFromCounts(counts),
    ok: counts.fail === 0,
  };
}

function checksOnlyEmbeds(result, title, checks, description) {
  const scoped = filteredResult(result, checks);
  const color = colorForState(scoped.state);
  const embeds = [summaryEmbed(scoped, title, description)];
  const chunks = chunkLines(buildSectionLines(checks));

  if (!chunks.length) {
    embeds.push(
      new EmbedBuilder()
        .setTitle("체크 항목")
        .setColor(color)
        .setDescription("표시할 항목이 없습니다."),
    );
    return embeds;
  }

  chunks.forEach((chunk, index) => {
    embeds.push(
      new EmbedBuilder()
        .setTitle(index === 0 ? "체크 항목" : `체크 항목 ${index + 1}`)
        .setColor(color)
        .setDescription(chunk),
    );
  });

  return embeds.slice(0, 10);
}

function serviceChecks(result) {
  return result.checks.filter((item) => ["백엔드 /health", "Discord 설정"].includes(item.name));
}

function pageChecks(result) {
  return result.checks.filter((item) => CORE_ROUTE_CHECKS.some((route) => route.name === item.name) || item.name.startsWith("추가 경로"));
}

function dataChecks(result) {
  return result.checks.filter((item) =>
    ["데이터 카테고리", "JSON 무결성", "검색 인덱스", "미정의 사실 상태판"].includes(item.name),
  );
}

function crawlerChecks(result) {
  return result.checks.filter((item) => ["크롤러 DB", "크롤링 대상"].includes(item.name));
}

function statusEmbeds(result, title = "War Archive 전체 상태") {
  const color = colorForState(result.state);
  const embeds = [
    summaryEmbed(result, title, "Discord 봇이 확인 가능한 War Archive 운영 항목 전체입니다."),
  ];

  const groups = [
    {
      title: "서비스",
      checks: serviceChecks(result),
    },
    {
      title: "페이지/API",
      checks: pageChecks(result),
    },
    {
      title: "데이터",
      checks: [...dataChecks(result), ...crawlerChecks(result)],
    },
  ];

  for (const group of groups) {
    if (!group.checks.length) continue;
    const lines = buildSectionLines(group.checks);
    const chunks = chunkLines(lines);
    chunks.forEach((chunk, index) => {
      embeds.push(
        new EmbedBuilder()
          .setTitle(index === 0 ? group.title : `${group.title} ${index + 1}`)
          .setColor(color)
          .setDescription(chunk),
      );
    });
  }

  return embeds.slice(0, 10);
}

function monitorEmbeds(result) {
  const latest = result || lastCheck;
  const state = latest ? latest.state : "warn";
  const color = colorForState(state);
  const latestText = latest
    ? `${textForState(latest.state)} | OK ${latest.counts.ok} / WARN ${latest.counts.warn} / FAIL ${latest.counts.fail} | ${discordTimestamp(latest.checkedAt)}`
    : "아직 실행된 체크가 없습니다.";

  return [
    new EmbedBuilder()
      .setTitle("War Archive 모니터 설정")
      .setColor(color)
      .setDescription("자동 모니터링 주기와 최근 상태입니다.")
      .addFields(
        { name: "마지막 체크", value: latestText, inline: false },
        { name: "모니터 주기", value: `${MONITOR_INTERVAL_SECONDS}s`, inline: true },
        { name: "장애 알림 기준", value: `${MONITOR_FAILURE_THRESHOLD}회 연속 실패`, inline: true },
        { name: "요청 타임아웃", value: `${REQUEST_TIMEOUT_MS}ms`, inline: true },
        { name: "데이터 오래됨 기준", value: `${STALE_DATA_HOURS}h`, inline: true },
        { name: "실패 연속 횟수", value: String(failureStreak), inline: true },
        { name: "마지막 알림 상태", value: lastNotifiedState || "없음", inline: true },
        { name: "자동 감시", value: monitorEnabled ? "실행 중" : "일시정지", inline: true },
        { name: "상태 채널", value: STATUS_CHANNEL_ID || "미설정", inline: false },
      ),
  ];
}

function startupPanelEmbed(result) {
  const state = result ? result.state : "warn";
  const counts = result ? result.counts : { ok: 0, warn: 1, fail: 0 };
  const checkedAt = result ? discordTimestamp(result.checkedAt) : "아직 체크 전";
  const commandLines = [
    "`/war-status` 전체 상태",
    "`/war-issues` 장애/주의",
    "`/war-health` 서비스",
    "`/war-pages` 페이지/API",
    "`/war-data` 데이터",
    "`/war-crawler` 크롤러",
    "`/war-probe` 단일 경로",
    "`/war-latency` 응답 시간",
    "`/war-monitor` 모니터 설정",
    "`/war-watch` 자동 감시 제어",
    "`/war-alert-test` 알림 테스트",
    "`/war-publish` 채널 게시",
  ];

  return new EmbedBuilder()
    .setTitle("War Archive 모니터 시작")
    .setColor(colorForState(state))
    .setDescription("Discord 봇이 연결되었고 자동 상태 모니터링을 시작했습니다.")
    .addFields(
      { name: "현재 상태", value: `${textForState(state)} | OK ${counts.ok} / WARN ${counts.warn} / FAIL ${counts.fail}`, inline: false },
      { name: "자동 확인", value: `${MONITOR_INTERVAL_SECONDS}s마다 확인`, inline: true },
      { name: "장애 알림", value: `${MONITOR_FAILURE_THRESHOLD}회 연속 실패 시 알림`, inline: true },
      { name: "요청 제한", value: `${REQUEST_TIMEOUT_MS}ms timeout`, inline: true },
      {
        name: "명령 등록",
        value: `${commandRegistration.ok ? "성공" : "실패/대기"} | ${commandRegistration.scope} | ${commandRegistration.detail}`,
        inline: false,
      },
      { name: "상태 채널", value: STATUS_CHANNEL_ID || "미설정", inline: false },
      { name: "접속 주소", value: PUBLIC_URL, inline: false },
      { name: "사용 명령", value: commandLines.join("\n"), inline: false },
      { name: "시작 체크", value: checkedAt, inline: false },
    )
    .setFooter({ text: "War Archive Discord monitor" });
}

function issuesEmbeds(result) {
  const issues = result.checks.filter((item) => item.status !== "ok");
  if (!issues.length) {
    return [
      new EmbedBuilder()
        .setTitle("War Archive 장애/주의 항목")
        .setColor(0x2ecc71)
        .setDescription("현재 WARN/FAIL 항목이 없습니다.")
        .addFields({ name: "확인 시각", value: discordTimestamp(result.checkedAt), inline: false }),
    ];
  }

  return checksOnlyEmbeds(result, "War Archive 장애/주의 항목", issues, "현재 조치가 필요한 모니터링 항목만 표시합니다.");
}

function normalizeProbePath(value) {
  const routePath = String(value || "").trim();
  if (!routePath || !routePath.startsWith("/") || routePath.startsWith("//")) {
    return null;
  }
  return routePath;
}

function routeProbeEmbed(routePath, item) {
  return new EmbedBuilder()
    .setTitle("War Archive 경로 확인")
    .setColor(colorForState(item.status))
    .setDescription(`${icon(item.status)} ${item.detail}`)
    .addFields(
      { name: "경로", value: routePath, inline: false },
      { name: "검사 URL", value: buildUrl(routePath), inline: false },
      { name: "확인 시각", value: discordTimestamp(new Date()), inline: false },
    );
}

async function latencyEmbed(samples) {
  const results = [];
  for (let index = 0; index < samples; index += 1) {
    results.push(await fetchJsonOrText(HEALTH_URL));
  }

  const failures = results.filter((result) => !result.ok).length;
  const latencies = results.map((result) => result.latencyMs);
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const avg = Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);
  const lines = results.map((result, index) => {
    const status = result.ok ? "OK" : "FAIL";
    const http = result.statusCode ? `HTTP ${result.statusCode}` : result.error;
    return `${index + 1}. ${status} ${result.latencyMs}ms ${http}`;
  });

  return new EmbedBuilder()
    .setTitle("War Archive 응답 시간")
    .setColor(failures ? 0xe74c3c : 0x2ecc71)
    .setDescription(lines.join("\n"))
    .addFields(
      { name: "측정 횟수", value: `${samples}회`, inline: true },
      { name: "최소/평균/최대", value: `${min}ms / ${avg}ms / ${max}ms`, inline: true },
      { name: "실패", value: `${failures}회`, inline: true },
      { name: "헬스체크", value: HEALTH_URL, inline: false },
    );
}

async function sendAlertTest(userTag) {
  if (!STATUS_CHANNEL_ID) {
    return { ok: false, message: "DISCORD_STATUS_CHANNEL_ID가 설정되지 않아 테스트 알림을 보낼 수 없습니다." };
  }

  try {
    const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
    if (!channel || typeof channel.send !== "function") {
      return { ok: false, message: `채널 ${STATUS_CHANNEL_ID}에 메시지를 보낼 수 없습니다.` };
    }
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("War Archive 알림 테스트")
          .setColor(0x3498db)
          .setDescription("Discord 상태 채널 알림 연결이 정상입니다.")
          .addFields(
            { name: "실행자", value: userTag || "unknown", inline: true },
            { name: "실행 시각", value: discordTimestamp(new Date()), inline: true },
          ),
      ],
    });
    return { ok: true, message: "상태 채널에 테스트 알림을 보냈습니다." };
  } catch (error) {
    return { ok: false, message: `테스트 알림 전송 실패: ${error.message}` };
  }
}

async function sendStartupPanel(result) {
  if (!STATUS_CHANNEL_ID || !STARTUP_PANEL_ENABLED) return;

  try {
    const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
    if (!channel || typeof channel.send !== "function") {
      console.warn(`Channel ${STATUS_CHANNEL_ID} cannot receive messages.`);
      return;
    }
    const content = result && result.state === "fail" && ALERT_ROLE_ID ? `<@&${ALERT_ROLE_ID}>` : undefined;
    await channel.send({ content, embeds: [startupPanelEmbed(result)] });
  } catch (error) {
    console.error("Failed to send Discord startup panel:", error);
  }
}

async function sendStatusToChannel(result, title) {
  if (!STATUS_CHANNEL_ID) return;

  try {
    const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
    if (!channel || typeof channel.send !== "function") {
      console.warn(`Channel ${STATUS_CHANNEL_ID} cannot receive messages.`);
      return;
    }
    const content = result.state === "fail" && ALERT_ROLE_ID ? `<@&${ALERT_ROLE_ID}>` : undefined;
    await channel.send({ content, embeds: statusEmbeds(result, title) });
  } catch (error) {
    console.error("Failed to send Discord status message:", error);
  }
}

async function runMonitorCheck(reason = "interval") {
  const result = await checkWarArchive();
  lastCheck = result;

  if (result.state === "fail") {
    failureStreak += 1;
    if (reason === "startup") {
      lastNotifiedState = "fail";
      return result;
    }
    if (failureStreak >= MONITOR_FAILURE_THRESHOLD && lastNotifiedState !== "fail") {
      await sendStatusToChannel(result, "War Archive 장애 감지");
      lastNotifiedState = "fail";
    }
    return result;
  }

  failureStreak = 0;

  if (lastNotifiedState === "fail") {
    await sendStatusToChannel(result, result.state === "warn" ? "War Archive 부분 복구" : "War Archive 복구");
    lastNotifiedState = result.state;
  } else if (reason === "startup" && ANNOUNCE_ON_STARTUP) {
    lastNotifiedState = result.state;
  } else if (result.state === "warn" && lastNotifiedState !== "warn") {
    await sendStatusToChannel(result, "War Archive 주의 필요");
    lastNotifiedState = "warn";
  }

  return result;
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const body = commands.map((command) => command.toJSON());
  const applicationId = client.user.id;

  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(applicationId, GUILD_ID), { body });
    commandRegistration = {
      ok: true,
      detail: `${body.length} commands registered`,
      scope: `guild ${GUILD_ID}`,
    };
    console.log(`Registered ${body.length} Discord commands for guild ${GUILD_ID}: ${body.map((command) => command.name).join(", ")}`);
    return;
  }

  await rest.put(Routes.applicationCommands(applicationId), { body });
  commandRegistration = {
    ok: true,
    detail: `${body.length} commands registered`,
    scope: "global",
  };
  console.log(`Registered ${body.length} global Discord commands: ${body.map((command) => command.name).join(", ")}`);
}

client.once(Events.ClientReady, async () => {
  console.log(`War Archive Discord bot connected as ${client.user.tag}.`);

  try {
    await registerCommands();
  } catch (error) {
    commandRegistration = {
      ok: false,
      detail: error.message,
      scope: GUILD_ID ? `guild ${GUILD_ID}` : "global",
    };
    console.error("Failed to register Discord commands:", error);
  }

  const startupResult = await runMonitorCheck("startup");
  if (ANNOUNCE_ON_STARTUP) {
  await sendStartupPanel(startupResult);
  }
  monitorTimer = setInterval(() => {
    if (!monitorEnabled) return;
    runMonitorCheck().catch((error) => console.error("Monitor check failed:", error));
  }, MONITOR_INTERVAL_SECONDS * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply({ ephemeral: true });

  if (interaction.commandName === "war-monitor") {
    await interaction.editReply({ embeds: monitorEmbeds(lastCheck) });
    return;
  }

  if (interaction.commandName === "war-watch") {
    const action = interaction.options.getSubcommand();
    if (action === "pause") {
      monitorEnabled = false;
    } else if (action === "resume") {
      monitorEnabled = true;
    }
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("War Archive 자동 감시")
          .setColor(monitorEnabled ? 0x2ecc71 : 0xf1c40f)
          .setDescription(monitorEnabled ? "자동 주기 체크가 실행 중입니다." : "자동 주기 체크가 일시정지되었습니다.")
          .addFields(
            { name: "요청", value: action, inline: true },
            { name: "주기", value: `${MONITOR_INTERVAL_SECONDS}s`, inline: true },
            { name: "실패 연속 횟수", value: String(failureStreak), inline: true },
          ),
      ],
    });
    return;
  }

  if (interaction.commandName === "war-probe") {
    const routePath = normalizeProbePath(interaction.options.getString("path"));
    if (!routePath) {
      await interaction.editReply("경로는 `/`로 시작하는 War Archive 내부 경로만 입력할 수 있습니다.");
      return;
    }
    const item = await checkRoute({ name: routePath, path: routePath, expected: [200] });
    await interaction.editReply({ embeds: [routeProbeEmbed(routePath, item)] });
    return;
  }

  if (interaction.commandName === "war-latency") {
    const samples = interaction.options.getInteger("samples") || 5;
    await interaction.editReply({ embeds: [await latencyEmbed(samples)] });
    return;
  }

  if (interaction.commandName === "war-alert-test") {
    const result = await sendAlertTest(interaction.user.tag);
    await interaction.editReply(result.message);
    return;
  }

  const result = await checkWarArchive();
  lastCheck = result;

  if (interaction.commandName === "war-status") {
    await interaction.editReply({ embeds: statusEmbeds(result) });
    return;
  }

  if (interaction.commandName === "war-issues") {
    await interaction.editReply({ embeds: issuesEmbeds(result) });
    return;
  }

  if (interaction.commandName === "war-health") {
    await interaction.editReply({
      embeds: checksOnlyEmbeds(result, "War Archive 서비스 상태", serviceChecks(result), "백엔드 헬스체크와 Discord 연결 설정입니다."),
    });
    return;
  }

  if (interaction.commandName === "war-pages") {
    await interaction.editReply({
      embeds: checksOnlyEmbeds(result, "War Archive 페이지/API 상태", pageChecks(result), "주요 화면과 인증 API 경로 응답입니다."),
    });
    return;
  }

  if (interaction.commandName === "war-data") {
    await interaction.editReply({
      embeds: checksOnlyEmbeds(result, "War Archive 데이터 상태", dataChecks(result), "프론트 데이터, JSON, 검색 인덱스 상태입니다."),
    });
    return;
  }

  if (interaction.commandName === "war-crawler") {
    await interaction.editReply({
      embeds: checksOnlyEmbeds(result, "War Archive 크롤러 상태", crawlerChecks(result), "크롤러 DB와 수집 대상 파일 상태입니다."),
    });
    return;
  }

  if (interaction.commandName === "war-publish") {
    if (!STATUS_CHANNEL_ID) {
      await interaction.editReply("DISCORD_STATUS_CHANNEL_ID가 설정되지 않아 게시할 채널이 없습니다.");
      return;
    }
    await sendStatusToChannel(result, "War Archive 수동 상태 게시");
    await interaction.editReply("현재 전체 상태를 설정된 상태 채널에 게시했습니다.");
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  if (monitorTimer) clearInterval(monitorTimer);
  client.destroy();
  process.exit(0);
}

client.login(TOKEN).catch((error) => {
  if (error && error.code === "TokenInvalid") {
    console.error("DISCORD_BOT_TOKEN is invalid. Regenerate the Bot Token in Discord Developer Portal and update .env.");
  } else {
    console.error("Discord login failed:", error);
  }
  process.exit(1);
});
