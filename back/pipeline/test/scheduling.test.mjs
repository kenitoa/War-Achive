import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { collectSourceCycle } from "../dist/collection.js";
import { mergeArchiveRecords, publishNextRecord, pushRecordToFront, rollbackLastPublication } from "../dist/publication.js";
import { remainingDelay } from "../dist/scheduler-utils.js";

let directory;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "war-archive-scheduling-"));
  const topicsPath = join(directory, "topics.json");
  await writeFile(topicsPath, JSON.stringify({
    topics: [{
      id: "imjin-war",
      title: "임진왜란",
      period: "1592-1598",
      region: "조선과 동아시아",
      sources: [
        { id: "overview", kind: "inline", url: "internal://imjin/overview", content: "임진왜란 사건 개요와 전투 기록" },
        { id: "people", kind: "inline", url: "internal://imjin/people", content: "임진왜란 관련 인물과 증언 자료" },
        { id: "duplicate-url", kind: "inline", url: "internal://imjin/overview", content: "다른 본문이어도 같은 출처 URL인 중복 자료" },
        { id: "duplicate-content", kind: "inline", url: "internal://imjin/copy", content: "임진왜란 관련 인물과 증언 자료" }
      ]
    }]
  }), "utf-8");
  process.env.WAR_ARCHIVE_DATA_ROOT = directory;
  process.env.WAR_ARCHIVE_TOPICS_PATH = topicsPath;
  process.env.GITHUB_PUBLISH_DISABLED = "true";
  process.env.PROCESSING_DELAY_MS = "0";
  process.env.COLLECTION_SHUFFLE_SOURCES = "false";
});

after(async () => {
  delete process.env.WAR_ARCHIVE_DATA_ROOT;
  delete process.env.WAR_ARCHIVE_TOPICS_PATH;
  delete process.env.GITHUB_PUBLISH_DISABLED;
  delete process.env.PROCESSING_DELAY_MS;
  delete process.env.COLLECTION_SHUFFLE_SOURCES;
  await rm(directory, { recursive: true, force: true });
});

test("one collection cycle sweeps all registered sources and deduplicates repeat cycles", async () => {
  const first = await collectSourceCycle();
  const second = await collectSourceCycle();
  assert.deepEqual(first.topicIds, ["imjin-war"]);
  assert.equal(first.attemptedSources, 4);
  assert.equal(first.addedDocuments, 2);
  assert.equal(second.collected, true);
  assert.equal(second.addedDocuments, 0);
  const records = JSON.parse(await readFile(join(directory, "informationized", "records.json"), "utf-8"));
  assert.equal(records.total, 1);
  assert.equal(records.items[0].id, "imjin-war");
  assert.equal(records.items[0].documentCount, 2);
});

test("same URL updates overwrite the existing raw document with changed fragments", async () => {
  const updateRoot = await mkdtemp(join(tmpdir(), "war-archive-url-update-"));
  const topicsPath = join(updateRoot, "topics.json");
  process.env.WAR_ARCHIVE_DATA_ROOT = updateRoot;
  process.env.WAR_ARCHIVE_TOPICS_PATH = topicsPath;
  await writeFile(topicsPath, JSON.stringify({
    topics: [{
      id: "event-url",
      title: "Updated source event",
      period: "1900",
      region: "A",
      sources: [{ id: "source", kind: "inline", url: "internal://same/source", content: "History record first sentence. Battle source baseline." }]
    }]
  }), "utf-8");
  try {
    const first = await collectSourceCycle();
    await writeFile(topicsPath, JSON.stringify({
      topics: [{
        id: "event-url",
        title: "Updated source event",
        period: "1900",
        region: "A",
        sources: [{ id: "source", kind: "inline", url: "internal://same/source", content: "History record first sentence. Battle source baseline. Newly added treaty sentence." }]
      }]
    }), "utf-8");
    const second = await collectSourceCycle();
    const raw = JSON.parse(await readFile(join(updateRoot, "raw", "documents.json"), "utf-8"));
    assert.equal(first.addedDocuments, 1);
    assert.equal(second.addedDocuments, 1);
    assert.equal(raw.documents.length, 1);
    assert.equal(raw.documents[0].changeKind, "updated");
    assert.equal(raw.documents[0].changeSummary.mode, "added-fragments");
    assert.match(raw.documents[0].content, /Newly added treaty sentence/);
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_TOPICS_PATH = join(directory, "topics.json");
    await rm(updateRoot, { recursive: true, force: true });
  }
});

test("publisher releases at most one pending record per call", async () => {
  const first = await publishNextRecord();
  const second = await publishNextRecord();
  assert.equal(first.topicId, "imjin-war");
  assert.equal(second.published, false);
  const state = JSON.parse(await readFile(join(directory, "state", "publication.json"), "utf-8"));
  assert.deepEqual(state.publishedTopicIds, ["imjin-war"]);
  assert.ok(state.lastPublishedAt);
});

test("publisher waits for the 10 minute processing window before release", async () => {
  const delayRoot = await mkdtemp(join(tmpdir(), "war-archive-delay-"));
  process.env.WAR_ARCHIVE_DATA_ROOT = delayRoot;
  process.env.PROCESSING_DELAY_MS = String(10 * 60 * 1000);
  const collectedAtMs = Date.parse("2026-07-12T00:00:00Z");
  await mkdir(join(delayRoot, "informationized"), { recursive: true });
  await writeFile(join(delayRoot, "informationized", "records.json"), JSON.stringify({
    items: [{
      id: "delayed",
      title: "가공 대기 기록",
      period: "1",
      region: "A",
      summary: "가공 대기",
      sourceCount: 1,
      collectedAt: new Date(collectedAtMs).toISOString()
    }]
  }), "utf-8");
  try {
    const early = await publishNextRecord(collectedAtMs + 9 * 60 * 1000);
    const ready = await publishNextRecord(collectedAtMs + 10 * 60 * 1000);
    assert.equal(early.published, false);
    assert.equal(early.processingWaitMs, 60_000);
    assert.equal(ready.published, true);
    assert.equal(ready.topicId, "delayed");
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.PROCESSING_DELAY_MS = "0";
    await rm(delayRoot, { recursive: true, force: true });
  }
});

test("publisher skips records below the publication quality threshold", async () => {
  const qualityRoot = await mkdtemp(join(tmpdir(), "war-archive-quality-"));
  process.env.WAR_ARCHIVE_DATA_ROOT = qualityRoot;
  process.env.PROCESSING_DELAY_MS = "0";
  process.env.PUBLICATION_MIN_QUALITY_SCORE = "0.6";
  await mkdir(join(qualityRoot, "informationized"), { recursive: true });
  await writeFile(join(qualityRoot, "informationized", "records.json"), JSON.stringify({
    items: [
      { id: "low", title: "낮은 품질", period: "1", region: "A", summary: "부족", sourceCount: 1, qualityScore: 0.4 },
      { id: "high", title: "높은 품질", period: "2", region: "B", summary: "충분", sourceCount: 3, qualityScore: 0.8 }
    ]
  }), "utf-8");
  try {
    const result = await publishNextRecord();
    assert.equal(result.published, true);
    assert.equal(result.topicId, "high");
    const state = JSON.parse(await readFile(join(qualityRoot, "state", "publication.json"), "utf-8"));
    assert.deepEqual(state.publishedTopicIds, ["high"]);
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.PROCESSING_DELAY_MS = "0";
    delete process.env.PUBLICATION_MIN_QUALITY_SCORE;
    await rm(qualityRoot, { recursive: true, force: true });
  }
});

test("front archive push accumulates unique records and updates changed event clusters", () => {
  const first = { id: "first", title: "첫 기록", period: "1", region: "A", summary: "첫 자료", sourceCount: 1 };
  const second = { id: "second", title: "둘째 기록", period: "2", region: "B", summary: "둘째 자료", sourceCount: 2 };
  const accumulated = mergeArchiveRecords([first], second);
  assert.deepEqual(accumulated.map((record) => record.id), ["first", "second"]);
  assert.equal(mergeArchiveRecords(accumulated, second), accumulated);
  const expandedFirst = { ...first, summary: "expanded event cluster", documentCount: 4 };
  const updated = mergeArchiveRecords(accumulated, expandedFirst);
  assert.deepEqual(updated.map((record) => record.id), ["first", "second"]);
  assert.equal(updated[0].summary, expandedFirst.summary);
  assert.equal(updated[0].documentCount, 4);
});

test("GitHub publisher writes the cumulative archive file to the front repository", async () => {
  const originalFetch = globalThis.fetch;
  const first = { id: "first", title: "첫 기록", period: "1", region: "A", summary: "첫 자료", sourceCount: 1 };
  const second = { id: "second", title: "둘째 기록", period: "2", region: "B", summary: "둘째 자료", sourceCount: 2 };
  let updateBody;
  let storedContent = Buffer.from(JSON.stringify({ version: 1, items: [first] })).toString("base64");
  delete process.env.GITHUB_PUBLISH_DISABLED;
  process.env.GITHUB_FRONT_REPOSITORY = "owner/front";
  process.env.GITHUB_FRONT_TOKEN = "test-token";
  globalThis.fetch = async (_input, init = {}) => {
    if (init.method === "PUT") {
      updateBody = JSON.parse(String(init.body));
      storedContent = updateBody.content;
      return new Response(JSON.stringify({ commit: { sha: "new-sha" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      type: "file",
      encoding: "base64",
      sha: "old-sha",
      content: storedContent
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await pushRecordToFront(second);
    const written = JSON.parse(Buffer.from(updateBody.content, "base64").toString("utf-8"));
    assert.deepEqual(written.items.map((record) => record.id), ["first", "second"]);
    assert.equal(updateBody.sha, "old-sha");
    assert.equal(updateBody.branch, "main");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GITHUB_PUBLISH_DISABLED = "true";
    delete process.env.GITHUB_FRONT_REPOSITORY;
    delete process.env.GITHUB_FRONT_TOKEN;
  }
});

test("local publisher writes the cumulative archive file without a GitHub token", async () => {
  const archivePath = join(directory, "front-archive.json");
  await writeFile(archivePath, JSON.stringify({
    version: 1,
    items: [{ id: "first", title: "첫 기록", period: "1", region: "A", summary: "첫 자료", sourceCount: 1 }]
  }), "utf-8");
  const candidate = { id: "local-second", title: "로컬 기록", period: "2", region: "B", summary: "로컬 자료", sourceCount: 1 };
  const previousDisabled = process.env.GITHUB_PUBLISH_DISABLED;
  process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = archivePath;
  process.env.GITHUB_PUBLISH_DISABLED = "true";
  try {
    await pushRecordToFront(candidate);
    const written = JSON.parse(await readFile(archivePath, "utf-8"));
    assert.deepEqual(written.items.map((record) => record.id), ["first", "local-second"]);
  } finally {
    delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
    if (previousDisabled === undefined) delete process.env.GITHUB_PUBLISH_DISABLED;
    else process.env.GITHUB_PUBLISH_DISABLED = previousDisabled;
  }
});

test("publisher republishes an event cluster when grouped documents change", async () => {
  const updateRoot = await mkdtemp(join(tmpdir(), "war-archive-update-"));
  const archivePath = join(updateRoot, "front-archive.json");
  process.env.WAR_ARCHIVE_DATA_ROOT = updateRoot;
  process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = archivePath;
  process.env.PROCESSING_DELAY_MS = "0";
  await mkdir(join(updateRoot, "informationized"), { recursive: true });
  try {
    await writeFile(join(updateRoot, "informationized", "records.json"), JSON.stringify({
      items: [{ id: "event-x", title: "X event", period: "1", region: "A", summary: "a,b", sourceCount: 2, documentCount: 2 }]
    }), "utf-8");
    const first = await publishNextRecord();
    await writeFile(join(updateRoot, "informationized", "records.json"), JSON.stringify({
      items: [{ id: "event-x", title: "X event", period: "1", region: "A", summary: "a,b,e,g", sourceCount: 4, documentCount: 4 }]
    }), "utf-8");
    const second = await publishNextRecord();
    const archive = JSON.parse(await readFile(archivePath, "utf-8"));
    assert.equal(first.published, true);
    assert.equal(second.published, true);
    assert.equal(archive.items.length, 1);
    assert.equal(archive.items[0].summary, "a,b,e,g");
    assert.equal(archive.items[0].documentCount, 4);
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.PROCESSING_DELAY_MS = "0";
    delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
    await rm(updateRoot, { recursive: true, force: true });
  }
});

test("rollback restores the previous archive snapshot for a bad cluster update", async () => {
  const rollbackRoot = await mkdtemp(join(tmpdir(), "war-archive-rollback-"));
  const archivePath = join(rollbackRoot, "front-archive.json");
  process.env.WAR_ARCHIVE_DATA_ROOT = rollbackRoot;
  process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = archivePath;
  process.env.PROCESSING_DELAY_MS = "0";
  await mkdir(join(rollbackRoot, "informationized"), { recursive: true });
  try {
    await writeFile(join(rollbackRoot, "informationized", "records.json"), JSON.stringify({
      items: [{ id: "event-x", title: "X event", period: "1", region: "A", summary: "X(a,b)", sourceCount: 2, documentCount: 2, documentIds: ["a", "b"] }]
    }), "utf-8");
    await publishNextRecord();
    await writeFile(join(rollbackRoot, "informationized", "records.json"), JSON.stringify({
      items: [{ id: "event-x", title: "X event", period: "1", region: "A", summary: "X(a,c,d)", sourceCount: 3, documentCount: 3, documentIds: ["a", "c", "d"] }]
    }), "utf-8");
    await publishNextRecord();
    let archive = JSON.parse(await readFile(archivePath, "utf-8"));
    assert.equal(archive.items[0].summary, "X(a,c,d)");

    const rollback = await rollbackLastPublication();
    archive = JSON.parse(await readFile(archivePath, "utf-8"));
    assert.equal(rollback.rolledBack, true);
    assert.equal(rollback.recordId, "event-x");
    assert.equal(archive.items[0].summary, "X(a,b)");
    assert.deepEqual(archive.items[0].documentIds, ["a", "b"]);
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.PROCESSING_DELAY_MS = "0";
    delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
    await rm(rollbackRoot, { recursive: true, force: true });
  }
});

test("persisted success times preserve 10 and 60 minute intervals after restart", () => {
  const now = Date.parse("2026-07-12T01:00:00Z");
  const tenMinutesAgo = "2026-07-12T00:50:00Z";
  assert.equal(remainingDelay(tenMinutesAgo, 10 * 60 * 1000, now), 0);
  assert.equal(remainingDelay(tenMinutesAgo, 60 * 60 * 1000, now), 50 * 60 * 1000);
  assert.equal(remainingDelay("2026-07-11T23:00:00Z", 10 * 60 * 1000, now), 0);
  assert.equal(remainingDelay("invalid", 60 * 60 * 1000, now), 0);
  assert.equal(remainingDelay("2026-07-12T02:00:00Z", 60 * 60 * 1000, now), 60 * 60 * 1000);
});
