import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { collectNextTopic } from "../dist/collection.js";
import { mergeArchiveRecords, publishNextRecord, pushRecordToFront } from "../dist/publication.js";
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
});

after(async () => {
  delete process.env.WAR_ARCHIVE_DATA_ROOT;
  delete process.env.WAR_ARCHIVE_TOPICS_PATH;
  delete process.env.GITHUB_PUBLISH_DISABLED;
  await rm(directory, { recursive: true, force: true });
});

test("one topic collects all unique registered sources and prevents recollection", async () => {
  const first = await collectNextTopic();
  const second = await collectNextTopic();
  assert.equal(first.topicId, "imjin-war");
  assert.equal(second.collected, false);
  const records = JSON.parse(await readFile(join(directory, "informationized", "records.json"), "utf-8"));
  assert.equal(records.total, 1);
  assert.equal(records.items[0].id, "imjin-war");
  assert.equal(records.items[0].documentCount, 2);
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

test("front archive push accumulates unique records without replacing older records", () => {
  const first = { id: "first", title: "첫 기록", period: "1", region: "A", summary: "첫 자료", sourceCount: 1 };
  const second = { id: "second", title: "둘째 기록", period: "2", region: "B", summary: "둘째 자료", sourceCount: 2 };
  const accumulated = mergeArchiveRecords([first], second);
  assert.deepEqual(accumulated.map((record) => record.id), ["first", "second"]);
  assert.equal(mergeArchiveRecords(accumulated, second), accumulated);
});

test("GitHub publisher writes the cumulative archive file to the front repository", async () => {
  const originalFetch = globalThis.fetch;
  const first = { id: "first", title: "첫 기록", period: "1", region: "A", summary: "첫 자료", sourceCount: 1 };
  const second = { id: "second", title: "둘째 기록", period: "2", region: "B", summary: "둘째 자료", sourceCount: 2 };
  let updateBody;
  delete process.env.GITHUB_PUBLISH_DISABLED;
  process.env.GITHUB_FRONT_REPOSITORY = "owner/front";
  process.env.GITHUB_FRONT_TOKEN = "test-token";
  globalThis.fetch = async (_input, init = {}) => {
    if (init.method === "PUT") {
      updateBody = JSON.parse(String(init.body));
      return new Response("{}", { status: 200 });
    }
    return new Response(JSON.stringify({
      type: "file",
      encoding: "base64",
      sha: "old-sha",
      content: Buffer.from(JSON.stringify({ version: 1, items: [first] })).toString("base64")
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

test("persisted success times preserve 30 and 40 minute intervals after restart", () => {
  const now = Date.parse("2026-07-12T01:00:00Z");
  const tenMinutesAgo = "2026-07-12T00:50:00Z";
  assert.equal(remainingDelay(tenMinutesAgo, 30 * 60 * 1000, now), 20 * 60 * 1000);
  assert.equal(remainingDelay(tenMinutesAgo, 40 * 60 * 1000, now), 30 * 60 * 1000);
  assert.equal(remainingDelay("2026-07-11T23:00:00Z", 30 * 60 * 1000, now), 0);
  assert.equal(remainingDelay("invalid", 40 * 60 * 1000, now), 0);
  assert.equal(remainingDelay("2026-07-12T02:00:00Z", 40 * 60 * 1000, now), 40 * 60 * 1000);
});
