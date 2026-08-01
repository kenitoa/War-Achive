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
  const topicsPath = join(directory, "topics.json");
  await writeFile(topicsPath, JSON.stringify({
    topics: [{
      id: "imjin-war",
      title: "임진왜란",
      period: "1592-1598",
      region: "조선과 동아시아",
      sources: [
        { id: "overview", kind: "inline", url: "internal://imjin/overview", content: "임진왜란 사건 개요와 전투 기록" },
        { id: "people", kind: "inline", url: "internal://imjin/people", content: "임진왜란 관련 인물과 증언 자료" }
      ]
    }]
  }), "utf-8");
  stdout = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/run-pipeline.js"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, WAR_ARCHIVE_DATA_ROOT: directory, WAR_ARCHIVE_TOPICS_PATH: topicsPath },
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
    "clustered/documents.json",
    "informationized/records.json"
  ];
  const payloads = await Promise.all(relativePaths.map(async (path) => JSON.parse(await readFile(join(directory, path), "utf-8"))));
  assert.deepEqual(payloads.map((payload) => payload.stage), ["crawled", "labeled", "clustered", "informationized"]);
  assert.equal(payloads[2].totalClusters, 1);
  assert.equal(payloads[2].clusters[0].documentIds.length, 2);
});

test("informationization emits a searchable front archive record", async () => {
  const final = JSON.parse(await readFile(join(directory, "informationized", "records.json"), "utf-8"));
  assert.equal(final.total, 1);
  assert.equal(final.items[0].id, "imjin-war");
  assert.equal(final.items[0].documentCount, 2);
  assert.ok(final.items[0].indexedTerms > 0);
  assert.equal(final.items[0].curator.format, "history-curator-v1");
  assert.ok(final.items[0].curator.keyPoints.length > 0);
  assert.ok(final.items[0].curator.chronology.length > 0);
  assert.ok(final.items[0].curator.peopleAndPlaces.length > 0);
  assert.match(final.items[0].curator.sourceBasis, /등록 출처 2건/);
  assert.ok(final.items[0].qualityScore >= 0.6);
  assert.equal(final.items[0].qualityGate.passed, true);
  assert.match(stdout, /pipeline complete: swept 1 topics, 2 sources, 0 failed sources, 1 total records/);
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
