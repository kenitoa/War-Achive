import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

let directory;
let server;
let baseUrl;
const adminToken = "test-admin-token-value-1234567890";

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "war-archive-admin-"));
  const topicsPath = join(directory, "topics.json");
  await mkdir(join(directory, "state"), { recursive: true });
  await mkdir(join(directory, "raw"), { recursive: true });
  await mkdir(join(directory, "labeled"), { recursive: true });
  await mkdir(join(directory, "clustered"), { recursive: true });
  await mkdir(join(directory, "informationized"), { recursive: true });
  await writeFile(topicsPath, JSON.stringify({ topics: [{ id: "topic-1" }, { id: "topic-2" }] }), "utf-8");
  await writeFile(join(directory, "state", "collection.json"), JSON.stringify({ collectedTopicIds: ["topic-1"], lastCollectedAt: "2026-07-12T00:00:00Z" }), "utf-8");
  await writeFile(join(directory, "state", "publication.json"), JSON.stringify({ publishedTopicIds: ["topic-1"], lastPublishedAt: "2026-07-12T00:10:00Z" }), "utf-8");
  await writeFile(join(directory, "raw", "documents.json"), JSON.stringify({ documents: [{ id: "raw-1" }] }), "utf-8");
  await writeFile(join(directory, "labeled", "documents.json"), JSON.stringify({ documents: [{ id: "raw-1" }] }), "utf-8");
  await writeFile(join(directory, "clustered", "documents.json"), JSON.stringify({
    documents: [{
      id: "raw-1",
      title: "First record",
      sourceUrl: "internal://test",
      eventClusterId: "topic-1",
      eventClusterTitle: "First cluster",
      eventClusterConfidence: 0.72,
      qualityScore: 0.7,
      qualityDecision: "accepted",
      outlier: false
    }],
    clusters: [{
      id: "topic-1",
      title: "First cluster",
      confidence: 0.72,
      documentIds: ["raw-1"],
      sentenceIds: ["raw-1-s1"],
      algorithm: { firstPass: "dbscan", secondPass: "hdbscan", anomalyDetection: "isolation-forest", finalPass: "kmeans" },
      entityResolution: { method: "rag-vector-registry", matchedExisting: false, score: 0 }
    }]
  }), "utf-8");
  await writeFile(join(directory, "informationized", "records.json"), JSON.stringify({ items: [{ id: "topic-1", title: "첫 기록", period: "1592", region: "조선" }] }), "utf-8");

  baseUrl = await new Promise((resolve, reject) => {
    server = spawn(process.execPath, ["server.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, ADMIN_PORT: "0", WAR_ARCHIVE_DATA_ROOT: directory, WAR_ARCHIVE_TOPICS_PATH: topicsPath, WAR_ARCHIVE_ADMIN_TOKEN: adminToken },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    server.stderr.setEncoding("utf-8").on("data", (chunk) => { stderr += chunk; });
    server.stdout.setEncoding("utf-8").on("data", (chunk) => {
      const match = chunk.match(/0\.0\.0\.0:(\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error(stderr || `admin server exited ${code}`)));
  });
});

after(async () => {
  server?.kill();
  await rm(directory, { recursive: true, force: true });
});

test("admin status API reads NAS pipeline state without exposing credentials", async () => {
  const response = await fetch(`${baseUrl}/api/status`, { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.deepEqual(status.counts, {
    topics: 2,
    collectedTopics: 1,
    rawDocuments: 1,
    labeledDocuments: 1,
    clusteredDocuments: 1,
    eventClusters: 1,
    informationizedRecords: 1,
    publishedRecords: 1
  });
  assert.equal(status.state.nextTopicId, "all-configured-sources");
  assert.equal(status.schedules.processingDelayMs, 10 * 60 * 1000);
  assert.equal(status.security.adminAuthRequired, true);
  assert.equal(status.clusters.length, 1);
  assert.equal(JSON.stringify(status).includes("GITHUB_FRONT_TOKEN"), false);
});

test("admin status API rejects missing token", async () => {
  const response = await fetch(`${baseUrl}/api/status`);
  assert.equal(response.status, 401);
});

test("admin server returns the built React page", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="root"/);
});
