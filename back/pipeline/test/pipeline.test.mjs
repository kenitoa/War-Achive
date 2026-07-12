import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";

let directory;
let stdout = "";

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "war-archive-pipeline-"));
  stdout = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/run-pipeline.js"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, WAR_ARCHIVE_DATA_ROOT: directory },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let errors = "";
    child.stdout.setEncoding("utf-8").on("data", (chunk) => { output += chunk; });
    child.stderr.setEncoding("utf-8").on("data", (chunk) => { errors += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(output) : reject(new Error(errors || `exit ${code}`)));
  });
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("pipeline writes collection, labeling, and informationization artifacts", async () => {
  const relativePaths = [
    "raw/documents.json",
    "labeled/documents.json",
    "informationized/records.json"
  ];
  const payloads = await Promise.all(relativePaths.map(async (path) => JSON.parse(await readFile(join(directory, path), "utf-8"))));
  assert.deepEqual(payloads.map((payload) => payload.stage), ["crawled", "labeled", "informationized"]);
});

test("informationization emits a searchable front archive record", async () => {
  const final = JSON.parse(await readFile(join(directory, "informationized", "records.json"), "utf-8"));
  assert.equal(final.total, 1);
  assert.equal(final.items[0].id, "foundation-001");
  assert.equal(final.items[0].documentCount, 2);
  assert.ok(final.items[0].indexedTerms > 0);
  assert.match(stdout, /pipeline complete: collected foundation-001, 1 total records/);
});

test("pipeline rejects an empty topic source configuration", async () => {
  const invalidRoot = await mkdtemp(join(tmpdir(), "war-archive-invalid-"));
  const invalidConfig = join(invalidRoot, "topics.json");
  await writeFile(invalidConfig, JSON.stringify({ topics: [{ id: "empty", title: "Empty", period: "", region: "", sources: [] }] }), "utf-8");
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["dist/run-pipeline.js"], {
        cwd: new URL("..", import.meta.url),
        env: {
          ...process.env,
          WAR_ARCHIVE_DATA_ROOT: invalidRoot,
          WAR_ARCHIVE_TOPICS_PATH: invalidConfig
        },
        stdio: ["ignore", "ignore", "pipe"]
      });
      let errors = "";
      child.stderr.setEncoding("utf-8").on("data", (chunk) => { errors += chunk; });
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, errors }));
    });
    assert.notEqual(result.code, 0);
    assert.match(result.errors, /주제 설정/);
  } finally {
    await rm(invalidRoot, { recursive: true, force: true });
  }
});
