import { readdir, readFile, stat } from "node:fs/promises";
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
  "token",
  "test-token",
  "actual_token",
  "실제_토큰",
  "발급한_토큰"
]);

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
  });
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log("secret-scan-ok");
