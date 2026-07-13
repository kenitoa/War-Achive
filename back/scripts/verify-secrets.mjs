import { access, readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  ".next",
  "out",
  ".expo",
  ".local-data"
]);
const ignoredFiles = new Set([
  "package-lock.json"
]);
const textExtensions = new Set([
  ".astro",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml"
]);
const placeholders = new Set([
  "",
  "replace-with-fine-grained-token",
  "replace-with-admin-token",
  "replace-with-discord-bot-token",
  "token",
  "test-token",
  "actual_token",
  "실제_토큰",
  "발급한_토큰"
]);
const requiredRuntimeSecrets = [
  "GITHUB_FRONT_TOKEN",
  "WAR_ARCHIVE_ADMIN_TOKEN"
];
const sensitiveOptionalEnvKeys = [
  "DISCORD_BOT_TOKEN"
];

function extensionOf(name) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index);
}

function normalizeTokenValue(value) {
  const trimmed = value.trim().replace(/\\$/, "").trim();
  const quoted = trimmed.match(/^(['"])(.*?)\1/);
  if (quoted) return quoted[2].trim();
  return trimmed.split(/\s+/)[0]?.trim() ?? "";
}

async function walk(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await walk(join(directory, entry.name), files);
      continue;
    }
    if (!entry.isFile() || ignoredFiles.has(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    const info = await stat(fullPath);
    if (info.size > 1_000_000) continue;
    if (!textExtensions.has(extensionOf(entry.name)) && !entry.name.includes(".env")) continue;
    files.push(fullPath);
  }
  return files;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values.set(match[1], normalizeTokenValue(match[2]));
  }
  return values;
}

const findings = [];
for (const file of await walk(root)) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (rel.endsWith(".env")) continue;
  const text = await readFile(file, "utf-8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/\b(?:github_pat|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/.test(line)) {
      findings.push(`${rel}:${index + 1} contains a GitHub token-like value`);
    }
    const match = line.match(/^\s*GITHUB_FRONT_TOKEN\s*=\s*(.+)\s*$/);
    if (match) {
      const value = normalizeTokenValue(match[1]);
      if (!placeholders.has(value)) findings.push(`${rel}:${index + 1} contains a non-placeholder GITHUB_FRONT_TOKEN`);
    }
    for (const key of sensitiveOptionalEnvKeys) {
      const optionalMatch = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`));
      if (!optionalMatch) continue;
      const value = normalizeTokenValue(optionalMatch[1]);
      if (!placeholders.has(value)) findings.push(`${rel}:${index + 1} contains a non-placeholder ${key}`);
    }
  });
}

const envPath = join(root, "back", ".env");
if (!(await exists(envPath))) {
  findings.push("back/.env is required for secure NAS operation");
} else {
  const runtimeEnv = parseEnv(await readFile(envPath, "utf-8"));
  for (const key of requiredRuntimeSecrets) {
    const value = runtimeEnv.get(key) ?? "";
    if (!value || placeholders.has(value)) findings.push(`back/.env contains a missing or placeholder ${key}`);
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log("secret-scan-ok");
