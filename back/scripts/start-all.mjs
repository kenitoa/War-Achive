import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const backRoot = fileURLToPath(new URL("..", import.meta.url));

function spawnManaged(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: backRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
    ...options
  });
  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[war-archive] ${name} stopped unexpectedly`, { code, signal });
    shutdown(1);
  });
  return child;
}

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ["run", "build"], {
      cwd: backRoot,
      env: process.env,
      stdio: "inherit",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build failed with exit code ${code}`));
    });
  });
}

let shuttingDown = false;
const children = [];

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = code;
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

await runBuild();

children.push(spawnManaged("collector", process.execPath, ["pipeline/dist/collection-scheduler.js"]));
children.push(spawnManaged("publisher", process.execPath, ["pipeline/dist/publication-scheduler.js"]));
children.push(spawnManaged("admin", process.execPath, ["admin/server.mjs"]));
children.push(spawnManaged("discord-monitor", process.execPath, ["Discord Bot/monitor.mjs"]));

console.log("[war-archive] collector, publisher, admin dashboard and Discord monitor started");
