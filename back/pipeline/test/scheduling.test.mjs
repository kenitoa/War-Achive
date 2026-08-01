import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { collectSourceCycle } from "../dist/collection.js";
import { mergeArchiveRecords, publishNextRecord, pushRecordToFront, rollbackLastPublication } from "../dist/publication.js";
import { remainingDelay } from "../dist/scheduler-utils.js";
import { clusterByEventTitle } from "../dist/stages/cluster.js";
import { informationize } from "../dist/stages/informationize.js";

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
  process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = join(directory, "front-archive.json");
  delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_DIR;
  delete process.env.GITHUB_FRONT_ARCHIVE_DIR;
  delete process.env.GITHUB_PUBLISH_DISABLED;
  process.env.PROCESSING_DELAY_MS = "0";
  process.env.COLLECTION_SHUFFLE_SOURCES = "false";
});

after(async () => {
  delete process.env.WAR_ARCHIVE_DATA_ROOT;
  delete process.env.WAR_ARCHIVE_TOPICS_PATH;
  delete process.env.GITHUB_PUBLISH_DISABLED;
  delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
  delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_DIR;
  delete process.env.GITHUB_FRONT_ARCHIVE_DIR;
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

test("collection advances paginated API sources across repeated cycles", async () => {
  const pagedRoot = await mkdtemp(join(tmpdir(), "war-archive-paged-"));
  const topicsPath = join(pagedRoot, "topics.json");
  const previousFetch = globalThis.fetch;
  process.env.WAR_ARCHIVE_DATA_ROOT = pagedRoot;
  process.env.WAR_ARCHIVE_TOPICS_PATH = topicsPath;
  process.env.COLLECTION_API_PAGES_PER_SOURCE = "2";
  process.env.COLLECTION_SHUFFLE_SOURCES = "false";
  globalThis.fetch = async (url) => {
    const page = new URL(String(url)).searchParams.get("page") ?? "1";
    return new Response(JSON.stringify({
      items: [{
        id: `item-${page}`,
        title: `Historical page ${page}`,
        body: `History archive battle record for page ${page}.`,
        url: `https://example.invalid/items/${page}`
      }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  await writeFile(topicsPath, JSON.stringify({
    topics: [{
      id: "paged",
      title: "Paged API",
      period: "1900",
      region: "A",
      sources: [{
        id: "api",
        kind: "api-json",
        url: "https://example.invalid/search?page=1",
        api: {
          itemPath: "items",
          idPath: "id",
          titlePath: "title",
          contentPaths: ["title", "body"],
          urlPath: "url",
          maxItems: 10,
          pagination: { strategy: "query-param", param: "page", start: 1, step: 1 }
        },
        compliance: {
          reviewedAt: "2026-08-01",
          crawlAllowed: true,
          termsUrl: "https://example.invalid/terms",
          copyrightUrl: "https://example.invalid/copyright",
          minIntervalMs: 1000
        }
      }]
    }]
  }), "utf-8");
  try {
    const first = await collectSourceCycle();
    const second = await collectSourceCycle();
    const raw = JSON.parse(await readFile(join(pagedRoot, "raw", "documents.json"), "utf-8"));
    const state = JSON.parse(await readFile(join(pagedRoot, "state", "collection.json"), "utf-8"));
    assert.equal(first.addedDocuments, 2);
    assert.equal(second.addedDocuments, 2);
    assert.equal(raw.documents.length, 4);
    assert.equal(state.sourceCursors["paged-api"], 5);
  } finally {
    if (previousFetch) globalThis.fetch = previousFetch;
    else delete globalThis.fetch;
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_TOPICS_PATH = join(directory, "topics.json");
    process.env.COLLECTION_SHUFFLE_SOURCES = "false";
    delete process.env.COLLECTION_API_PAGES_PER_SOURCE;
    await rm(pagedRoot, { recursive: true, force: true });
  }
});

test("collection does not advance API cursor when a paginated source page fails", async () => {
  const pagedRoot = await mkdtemp(join(tmpdir(), "war-archive-paged-failure-"));
  const topicsPath = join(pagedRoot, "topics.json");
  const previousFetch = globalThis.fetch;
  process.env.WAR_ARCHIVE_DATA_ROOT = pagedRoot;
  process.env.WAR_ARCHIVE_TOPICS_PATH = topicsPath;
  process.env.COLLECTION_API_PAGES_PER_SOURCE = "2";
  process.env.COLLECTION_SHUFFLE_SOURCES = "false";
  globalThis.fetch = async (url) => {
    const page = new URL(String(url)).searchParams.get("page") ?? "1";
    if (page === "2") return new Response("temporary failure", { status: 503 });
    return new Response(JSON.stringify({
      items: [{
        id: `item-${page}`,
        title: `Historical page ${page}`,
        body: `History archive battle record for page ${page}.`,
        url: `https://example.invalid/items/${page}`
      }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  await writeFile(topicsPath, JSON.stringify({
    topics: [{
      id: "paged",
      title: "Paged API",
      period: "1900",
      region: "A",
      sources: [{
        id: "api",
        kind: "api-json",
        url: "https://example.invalid/search?page=1",
        api: {
          itemPath: "items",
          idPath: "id",
          titlePath: "title",
          contentPaths: ["title", "body"],
          urlPath: "url",
          maxItems: 10,
          pagination: { strategy: "query-param", param: "page", start: 1, step: 1 }
        },
        compliance: {
          reviewedAt: "2026-08-01",
          crawlAllowed: true,
          termsUrl: "https://example.invalid/terms",
          copyrightUrl: "https://example.invalid/copyright",
          minIntervalMs: 1000
        }
      }]
    }]
  }), "utf-8");
  try {
    const result = await collectSourceCycle();
    const state = JSON.parse(await readFile(join(pagedRoot, "state", "collection.json"), "utf-8"));
    assert.equal(result.addedDocuments, 1);
    assert.equal(result.failedSources, 1);
    assert.equal(state.sourceCursors?.["paged-api"], undefined);
    assert.equal(state.lastPartialErrors.length, 1);
  } finally {
    if (previousFetch) globalThis.fetch = previousFetch;
    else delete globalThis.fetch;
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_TOPICS_PATH = join(directory, "topics.json");
    process.env.COLLECTION_SHUFFLE_SOURCES = "false";
    delete process.env.COLLECTION_API_PAGES_PER_SOURCE;
    await rm(pagedRoot, { recursive: true, force: true });
  }
});

test("collection stores direct-run failures in collection state", async () => {
  const failureRoot = await mkdtemp(join(tmpdir(), "war-archive-collect-state-failure-"));
  process.env.WAR_ARCHIVE_DATA_ROOT = failureRoot;
  process.env.WAR_ARCHIVE_TOPICS_PATH = join(failureRoot, "missing-topics.json");
  try {
    await assert.rejects(() => collectSourceCycle(), /ENOENT|no such file/i);
    const state = JSON.parse(await readFile(join(failureRoot, "state", "collection.json"), "utf-8"));
    assert.match(state.lastError, /ENOENT|no such file/i);
    assert.ok(state.lastAttemptedAt);
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_TOPICS_PATH = join(directory, "topics.json");
    await rm(failureRoot, { recursive: true, force: true });
  }
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

test("source failures do not block successful collection artifacts", async () => {
  const partialRoot = await mkdtemp(join(tmpdir(), "war-archive-partial-"));
  const topicsPath = join(partialRoot, "topics.json");
  process.env.WAR_ARCHIVE_DATA_ROOT = partialRoot;
  process.env.WAR_ARCHIVE_TOPICS_PATH = topicsPath;
  await writeFile(topicsPath, JSON.stringify({
    topics: [{
      id: "partial",
      title: "Partial source event",
      period: "1900",
      region: "A",
      sources: [
        { id: "good", kind: "inline", url: "internal://partial/good", content: "History battle archive record with enough source material." },
        { id: "bad", kind: "url", url: "https://example.invalid/bad" }
      ]
    }]
  }), "utf-8");
  try {
    const result = await collectSourceCycle();
    const raw = JSON.parse(await readFile(join(partialRoot, "raw", "documents.json"), "utf-8"));
    const state = JSON.parse(await readFile(join(partialRoot, "state", "collection.json"), "utf-8"));
    assert.equal(result.addedDocuments, 1);
    assert.equal(result.failedSources, 1);
    assert.equal(raw.documents.length, 1);
    assert.equal(raw.sourceFailures.length, 1);
    assert.equal(state.lastPartialErrors.length, 1);
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_TOPICS_PATH = join(directory, "topics.json");
    await rm(partialRoot, { recursive: true, force: true });
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

test("publisher stores GitHub credential read failures in publication state", async () => {
  const authRoot = await mkdtemp(join(tmpdir(), "war-archive-auth-failure-"));
  const previousFetch = globalThis.fetch;
  const previousRepository = process.env.GITHUB_FRONT_REPOSITORY;
  const previousToken = process.env.GITHUB_FRONT_TOKEN;
  const previousRef = process.env.GITHUB_FRONT_REF;
  const previousArchiveDir = process.env.GITHUB_FRONT_ARCHIVE_DIR;
  const previousFrontArchivePath = process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
  process.env.WAR_ARCHIVE_DATA_ROOT = authRoot;
  process.env.PROCESSING_DELAY_MS = "0";
  delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
  process.env.GITHUB_FRONT_REPOSITORY = "owner/front";
  process.env.GITHUB_FRONT_TOKEN = "bad-token";
  process.env.GITHUB_FRONT_REF = "main";
  process.env.GITHUB_FRONT_ARCHIVE_DIR = "web/content/archive";
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: "Bad credentials",
    documentation_url: "https://docs.github.com/rest",
    status: "401"
  }), { status: 401, headers: { "content-type": "application/json" } });
  await mkdir(join(authRoot, "informationized"), { recursive: true });
  await writeFile(join(authRoot, "informationized", "records.json"), JSON.stringify({
    items: [{
      id: "auth-failure",
      title: "Auth failure record",
      period: "1",
      region: "A",
      summary: "ready",
      sourceCount: 1,
      qualityScore: 1,
      collectedAt: new Date(0).toISOString()
    }]
  }), "utf-8");

  try {
    await assert.rejects(() => publishNextRecord(), /GITHUB_FRONT_TOKEN is not accepted/);
    const state = JSON.parse(await readFile(join(authRoot, "state", "publication.json"), "utf-8"));
    assert.match(state.lastError, /GitHub published archive directory read failed for owner\/front: 401/);
    assert.match(state.lastError, /GITHUB_FRONT_TOKEN is not accepted/);
    assert.ok(state.lastAttemptedAt);
  } finally {
    if (previousFetch) globalThis.fetch = previousFetch;
    else delete globalThis.fetch;
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = previousFrontArchivePath ?? join(directory, "front-archive.json");
    process.env.PROCESSING_DELAY_MS = "0";
    if (previousRepository === undefined) delete process.env.GITHUB_FRONT_REPOSITORY;
    else process.env.GITHUB_FRONT_REPOSITORY = previousRepository;
    if (previousToken === undefined) delete process.env.GITHUB_FRONT_TOKEN;
    else process.env.GITHUB_FRONT_TOKEN = previousToken;
    if (previousRef === undefined) delete process.env.GITHUB_FRONT_REF;
    else process.env.GITHUB_FRONT_REF = previousRef;
    if (previousArchiveDir === undefined) delete process.env.GITHUB_FRONT_ARCHIVE_DIR;
    else process.env.GITHUB_FRONT_ARCHIVE_DIR = previousArchiveDir;
    await rm(authRoot, { recursive: true, force: true });
  }
});

test("publisher repairs stale published state from the verified archive snapshot", async () => {
  const repairRoot = await mkdtemp(join(tmpdir(), "war-archive-repair-"));
  const archivePath = join(repairRoot, "front-archive.json");
  process.env.WAR_ARCHIVE_DATA_ROOT = repairRoot;
  process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = archivePath;
  process.env.PROCESSING_DELAY_MS = "0";
  await mkdir(join(repairRoot, "informationized"), { recursive: true });
  await mkdir(join(repairRoot, "state"), { recursive: true });
  const first = { id: "first", title: "First", period: "1", region: "A", summary: "first", sourceCount: 1, qualityScore: 0.9 };
  const missing = { id: "missing", title: "Missing", period: "2", region: "B", summary: "missing", sourceCount: 1, qualityScore: 0.9 };
  await writeFile(archivePath, JSON.stringify({ version: 1, items: [first] }), "utf-8");
  await writeFile(join(repairRoot, "informationized", "records.json"), JSON.stringify({ items: [first, missing] }), "utf-8");
  await writeFile(join(repairRoot, "state", "publication.json"), JSON.stringify({ version: 1, publishedTopicIds: ["first", "missing"], publishedRecordFingerprints: { first: "stale", missing: "stale" } }), "utf-8");
  try {
    const result = await publishNextRecord();
    const archive = JSON.parse(await readFile(archivePath, "utf-8"));
    const state = JSON.parse(await readFile(join(repairRoot, "state", "publication.json"), "utf-8"));
    assert.equal(result.published, true);
    assert.equal(result.topicId, "missing");
    assert.deepEqual(archive.items.map((record) => record.id), ["first", "missing"]);
    assert.deepEqual(state.publishedTopicIds, ["first", "missing"]);
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = join(directory, "front-archive.json");
    process.env.PROCESSING_DELAY_MS = "0";
    await rm(repairRoot, { recursive: true, force: true });
  }
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
  process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = join(qualityRoot, "front-archive.json");
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
    process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = join(directory, "front-archive.json");
    process.env.PROCESSING_DELAY_MS = "0";
    delete process.env.PUBLICATION_MIN_QUALITY_SCORE;
    await rm(qualityRoot, { recursive: true, force: true });
  }
});

test("publisher records heartbeat when no publishable records exist", async () => {
  const heartbeatRoot = await mkdtemp(join(tmpdir(), "war-archive-publisher-heartbeat-"));
  process.env.WAR_ARCHIVE_DATA_ROOT = heartbeatRoot;
  process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = join(heartbeatRoot, "front-archive.json");
  process.env.PROCESSING_DELAY_MS = "0";
  await mkdir(join(heartbeatRoot, "informationized"), { recursive: true });
  await writeFile(join(heartbeatRoot, "informationized", "records.json"), JSON.stringify({ items: [] }), "utf-8");
  try {
    const result = await publishNextRecord();
    const state = JSON.parse(await readFile(join(heartbeatRoot, "state", "publication.json"), "utf-8"));
    assert.equal(result.published, false);
    assert.ok(state.lastAttemptedAt);
    assert.deepEqual(state.publishedTopicIds, []);
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = join(directory, "front-archive.json");
    process.env.PROCESSING_DELAY_MS = "0";
    await rm(heartbeatRoot, { recursive: true, force: true });
  }
});

test("disabled publication does not mark a record as publicly published", async () => {
  const disabledRoot = await mkdtemp(join(tmpdir(), "war-archive-disabled-"));
  process.env.WAR_ARCHIVE_DATA_ROOT = disabledRoot;
  delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
  process.env.GITHUB_PUBLISH_DISABLED = "true";
  process.env.PROCESSING_DELAY_MS = "0";
  await mkdir(join(disabledRoot, "informationized"), { recursive: true });
  await writeFile(join(disabledRoot, "informationized", "records.json"), JSON.stringify({
    items: [{ id: "disabled", title: "Disabled", period: "1", region: "A", summary: "not pushed", sourceCount: 1, qualityScore: 0.9 }]
  }), "utf-8");
  try {
    const result = await publishNextRecord();
    const state = JSON.parse(await readFile(join(disabledRoot, "state", "publication.json"), "utf-8"));
    assert.equal(result.published, false);
    assert.equal(result.publicationDisabled, true);
    assert.deepEqual(state.publishedTopicIds, []);
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = join(directory, "front-archive.json");
    delete process.env.GITHUB_PUBLISH_DISABLED;
    await rm(disabledRoot, { recursive: true, force: true });
  }
});

test("review documents are persisted and reconsidered with later clustering input", async () => {
  const reviewRoot = await mkdtemp(join(tmpdir(), "war-archive-review-"));
  process.env.WAR_ARCHIVE_DATA_ROOT = reviewRoot;
  const reviewDocument = {
    id: "review-a", topicId: "review", title: "Low confidence", period: "1", region: "A", sourceUrl: "https://example.invalid/a", content: "Short unrelated note.", collectedAt: new Date().toISOString(), labels: ["unclassified"], reliability: "needs-review", sourceReliabilityScore: 0.42, relevanceScore: 0, contextGroup: "review"
  };
  await mkdir(join(reviewRoot, "labeled"), { recursive: true });
  await writeFile(join(reviewRoot, "labeled", "documents.json"), JSON.stringify({ documents: [reviewDocument] }), "utf-8");
  try {
    await clusterByEventTitle();
    const queue = JSON.parse(await readFile(join(reviewRoot, "review", "documents.json"), "utf-8"));
    assert.ok(queue.documents.some((document) => document.id === "review-a"));

    const laterDocument = { ...reviewDocument, id: "later-b", title: "Later evidence", sourceUrl: "https://example.invalid/b", content: "Later history archive battle evidence." };
    await writeFile(join(reviewRoot, "labeled", "documents.json"), JSON.stringify({ documents: [laterDocument] }), "utf-8");
    await clusterByEventTitle();
    const clustered = JSON.parse(await readFile(join(reviewRoot, "clustered", "documents.json"), "utf-8"));
    assert.ok(clustered.documents.some((document) => document.id === "review-a"));
    assert.ok(clustered.documents.some((document) => document.id === "later-b"));
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = join(directory, "front-archive.json");
    await rm(reviewRoot, { recursive: true, force: true });
  }
});

test("new documents attach to existing seeded clusters or form new clusters", async () => {
  const clusterRoot = await mkdtemp(join(tmpdir(), "war-archive-seeded-cluster-"));
  process.env.WAR_ARCHIVE_DATA_ROOT = clusterRoot;
  const base = {
    period: "1",
    region: "A",
    collectedAt: new Date().toISOString(),
    labels: ["battle"],
    reliability: "high",
    sourceReliabilityScore: 0.9,
    relevanceScore: 0.9
  };
  const doc = (id, title, content, clusterId, clusterTitle) => ({
    ...base,
    id,
    topicId: id,
    title,
    sourceUrl: `https://example.invalid/${id}`,
    content,
    ...(clusterId ? { eventClusterId: clusterId, eventClusterTitle: clusterTitle } : {})
  });
  const a = doc("a", "Naval blockade", "naval blockade admiral fleet sea cannon busan naval fleet battle", "cluster-a", "Naval blockade");
  const b = doc("b", "Fleet battle", "admiral naval fleet sea cannon blockade busan naval combat", "cluster-a", "Naval blockade");
  const c = doc("c", "Treaty mission", "armistice treaty envoy diplomacy negotiation court embassy treaty", "cluster-b", "Treaty mission");
  const d = doc("d", "Envoy negotiation", "diplomacy envoy treaty court embassy armistice negotiation", "cluster-b", "Treaty mission");
  const e = doc("e", "New naval evidence", "naval admiral fleet cannon sea blockade busan battle evidence");
  const f = doc("f", "Field hospital", "field hospital plague quarantine medicine surgeon epidemic medical");
  const g = doc("g", "New treaty evidence", "treaty envoy diplomacy armistice court embassy negotiation evidence");
  const h = doc("h", "Quarantine record", "plague quarantine field hospital medicine surgeon epidemic record");
  await mkdir(join(clusterRoot, "labeled"), { recursive: true });
  await mkdir(join(clusterRoot, "clustered"), { recursive: true });
  await writeFile(join(clusterRoot, "clustered", "documents.json"), JSON.stringify({ documents: [a, b, c, d] }), "utf-8");
  await writeFile(join(clusterRoot, "labeled", "documents.json"), JSON.stringify({ documents: [a, b, c, d, e, f, g, h] }), "utf-8");
  try {
    await clusterByEventTitle();
    const clustered = JSON.parse(await readFile(join(clusterRoot, "clustered", "documents.json"), "utf-8"));
    const byId = new Map(clustered.documents.map((document) => [document.id, document]));
    assert.equal(byId.get("e").eventClusterId, "cluster-a");
    assert.equal(byId.get("g").eventClusterId, "cluster-b");
    assert.notEqual(byId.get("f").eventClusterId, "cluster-a");
    assert.notEqual(byId.get("f").eventClusterId, "cluster-b");
    assert.equal(byId.get("f").eventClusterId, byId.get("h").eventClusterId);
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = join(directory, "front-archive.json");
    await rm(clusterRoot, { recursive: true, force: true });
  }
});

test("informationization excludes review documents from publishable records", async () => {
  const informationRoot = await mkdtemp(join(tmpdir(), "war-archive-information-"));
  process.env.WAR_ARCHIVE_DATA_ROOT = informationRoot;
  const base = { period: "1", region: "A", content: "History archive battle record.", collectedAt: new Date().toISOString(), labels: ["battle"], reliability: "high", sourceReliabilityScore: 0.9, relevanceScore: 0.8, eventClusterConfidence: 0.8, outlier: false, qualityDecision: "accepted" };
  await mkdir(join(informationRoot, "clustered"), { recursive: true });
  await writeFile(join(informationRoot, "clustered", "documents.json"), JSON.stringify({ documents: [
    { ...base, id: "accepted", topicId: "accepted", title: "Accepted", sourceUrl: "https://example.invalid/accepted", eventClusterId: "accepted", eventClusterTitle: "Accepted" },
    { ...base, id: "review", topicId: "review", title: "Review", sourceUrl: "https://example.invalid/review", eventClusterId: "review", eventClusterTitle: "Review", qualityDecision: "review" }
  ] }), "utf-8");
  try {
    const result = await informationize();
    assert.equal(result.total, 1);
    assert.equal(result.items[0].id, "accepted");
  } finally {
    process.env.WAR_ARCHIVE_DATA_ROOT = directory;
    process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = join(directory, "front-archive.json");
    await rm(informationRoot, { recursive: true, force: true });
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

test("GitHub publisher writes an archive record file to the front repository", async () => {
  const originalFetch = globalThis.fetch;
  const previousLocalArchivePath = process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
  const previousArchiveDir = process.env.GITHUB_FRONT_ARCHIVE_DIR;
  const first = { id: "first", title: "첫 기록", period: "1", region: "A", summary: "첫 자료", sourceCount: 1 };
  const second = { id: "second", title: "둘째 기록", period: "2", region: "B", summary: "둘째 자료", sourceCount: 2 };
  const files = new Map([
    ["web/content/archive/first.json", { sha: "first-sha", content: first }]
  ]);
  const updateBodies = new Map();
  delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
  delete process.env.GITHUB_PUBLISH_DISABLED;
  process.env.GITHUB_FRONT_REPOSITORY = "owner/front";
  process.env.GITHUB_FRONT_TOKEN = "test-token";
  process.env.GITHUB_FRONT_ARCHIVE_DIR = "web/content/archive";
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const path = decodeURIComponent(url.match(/\/contents\/([^?]+)/)?.[1] ?? "");
    if (init.method === "PUT") {
      const body = JSON.parse(String(init.body));
      updateBodies.set(path, body);
      files.set(path, { sha: `${path}-sha`, content: JSON.parse(Buffer.from(body.content, "base64").toString("utf-8")) });
      return new Response(JSON.stringify({ commit: { sha: "new-sha" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (path === "web/content/archive") {
      return new Response(JSON.stringify([...files.entries()].map(([filePath]) => ({
        type: "file",
        name: filePath.split("/").at(-1),
        path: filePath
      }))), { status: 200, headers: { "content-type": "application/json" } });
    }
    const file = files.get(path);
    if (!file) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({
      type: "file",
      encoding: "base64",
      sha: file.sha,
      content: Buffer.from(JSON.stringify(file.content)).toString("base64")
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await pushRecordToFront(second);
    assert.deepEqual(files.get("web/content/archive/second.json")?.content, second);
    assert.equal(updateBodies.get("web/content/archive/second.json").branch, "main");
    assert.equal(updateBodies.has("web/content/archive/index.json"), true);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GITHUB_PUBLISH_DISABLED = "true";
    if (previousLocalArchivePath === undefined) delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
    else process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = previousLocalArchivePath;
    if (previousArchiveDir === undefined) delete process.env.GITHUB_FRONT_ARCHIVE_DIR;
    else process.env.GITHUB_FRONT_ARCHIVE_DIR = previousArchiveDir;
    delete process.env.GITHUB_FRONT_REPOSITORY;
    delete process.env.GITHUB_FRONT_TOKEN;
  }
});

test("local publisher writes archive record files without a GitHub token", async () => {
  const archiveDir = join(directory, "front-archive");
  await mkdir(archiveDir, { recursive: true });
  await writeFile(join(archiveDir, "first.json"), JSON.stringify({ id: "first", title: "첫 기록", period: "1", region: "A", summary: "첫 자료", sourceCount: 1 }), "utf-8");
  const candidate = { id: "local-second", title: "로컬 기록", period: "2", region: "B", summary: "로컬 자료", sourceCount: 1 };
  const previousDisabled = process.env.GITHUB_PUBLISH_DISABLED;
  const previousLocalArchivePath = process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
  process.env.WAR_ARCHIVE_FRONT_ARCHIVE_DIR = archiveDir;
  delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
  process.env.GITHUB_PUBLISH_DISABLED = "true";
  try {
    await pushRecordToFront(candidate);
    const written = JSON.parse(await readFile(join(archiveDir, "local-second.json"), "utf-8"));
    const snapshot = JSON.parse(await readFile(join(directory, "published", "archive", "index.json"), "utf-8"));
    assert.equal(written.id, "local-second");
    assert.deepEqual(snapshot.items.map((record) => record.id), ["first", "local-second"]);
  } finally {
    delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_DIR;
    if (previousLocalArchivePath === undefined) delete process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
    else process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH = previousLocalArchivePath;
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
