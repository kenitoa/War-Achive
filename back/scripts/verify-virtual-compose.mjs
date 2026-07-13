import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mockCompose = fileURLToPath(new URL("./mock-compose.mjs", import.meta.url));
const result = spawnSync(process.execPath, ["scripts/preflight.mjs", "--strict"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: {
    ...process.env,
    DOCKER_COMPOSE_COMMAND: `"${process.execPath}" "${mockCompose}" compose version`
  },
  encoding: "utf-8"
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
