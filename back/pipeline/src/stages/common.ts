import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

function loadDotEnv(): void {
  let directory = dirname(fileURLToPath(import.meta.url));
  const visited = new Set<string>();
  for (let depth = 0; depth < 6 && !visited.has(directory); depth += 1) {
    visited.add(directory);
    const path = `${directory}/.env`;
    if (existsSync(path)) {
      const text = readFileSync(path, "utf-8");
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]] !== undefined) continue;
        process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
      }
      return;
    }
    directory = dirname(directory);
  }
}

loadDotEnv();

export function dataRoot(): string {
  return process.env.WAR_ARCHIVE_DATA_ROOT ?? "/data";
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf-8")) as T;
}

export async function writeJson(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await rename(temporary, path);
}
