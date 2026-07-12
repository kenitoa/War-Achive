import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const strict = process.argv.includes("--strict");
const here = dirname(fileURLToPath(import.meta.url));
const backRoot = join(here, "..");
const frontRoot = join(backRoot, "..", "front");

const failures = [];
const warnings = [];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function requireText(name, text, pattern, message) {
  if (!pattern.test(text)) failures.push(`${name}: ${message}`);
}

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf-8" });
}

const backGitignore = await readFile(join(backRoot, ".gitignore"), "utf-8");
requireText("back/.gitignore", backGitignore, /^\.env$/m, ".env must be ignored");

const compose = await readFile(join(backRoot, "docker-compose.yml"), "utf-8");
requireText("docker-compose.yml", compose, /healthcheck:/, "backend healthcheck is required");
requireText("docker-compose.yml", compose, /PROCESSING_DELAY_MS/, "10 minute processing delay env is required");
requireText("docker-compose.yml", compose, /PUBLICATION_MIN_QUALITY_SCORE/, "publication quality gate env is required");

const envExample = await readFile(join(backRoot, ".env.example"), "utf-8");
for (const key of [
  "GITHUB_FRONT_REPOSITORY",
  "GITHUB_FRONT_TOKEN",
  "GITHUB_FRONT_REF",
  "GITHUB_FRONT_CONTENT_PATH",
  "COLLECTION_INTERVAL_MS",
  "PROCESSING_DELAY_MS",
  "PUBLICATION_INTERVAL_MS",
  "PUBLICATION_MIN_QUALITY_SCORE"
]) {
  requireText(".env.example", envExample, new RegExp(`^${key}=`, "m"), `${key} is required`);
}

const frontPackage = await readFile(join(frontRoot, "package.json"), "utf-8");
if (/"admin"|@war-archive\/admin|dev:admin/.test(frontPackage)) failures.push("front/package.json: admin workspace must not be registered");
if (await exists(join(frontRoot, "admin"))) failures.push("front/admin must not exist in the public Pages repository");

const workflow = await readFile(join(frontRoot, ".github", "workflows", "pages.yml"), "utf-8");
if (/admin\/\*\*|@war-archive\/admin|web\/out\/admin/.test(workflow)) failures.push("front Pages workflow must not build or publish admin");

const docker = run("docker", ["compose", "version"]);
if (docker.status !== 0) {
  const message = "Docker Compose is not available on this machine";
  if (strict) failures.push(message);
  else warnings.push(message);
}

if (failures.length > 0) {
  console.error(["preflight-failed", ...failures].join("\n"));
  process.exit(1);
}

if (warnings.length > 0) console.warn(["preflight-warnings", ...warnings].join("\n"));
console.log("preflight-ok");
