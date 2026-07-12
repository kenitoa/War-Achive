import { stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { assertDeclaredCompliance, assertRobotsAllowed, waitForSourceInterval } from "./compliance.js";
import { topicsPath } from "./collection.js";
import { readJson } from "./stages/common.js";
import type { SourceDefinition, TopicDefinition } from "./stages/types.js";

const configurationPath = topicsPath();
const configuration = await readJson<{ topics?: TopicDefinition[] }>(configurationPath);
if (!Array.isArray(configuration.topics)) throw new Error("topics가 배열이 아닙니다.");
const sources: Array<SourceDefinition & { topicId: string }> = configuration.topics
  .flatMap((topic) => topic.sources.map((source) => ({ ...source, topicId: topic.id })));

const report: Array<Record<string, unknown>> = [];
for (const source of sources) {
  if (source.kind === "file") {
    if (!source.path) throw new Error(`file source path가 없습니다: ${source.id ?? "id 없음"}`);
    const sourcePath = isAbsolute(source.path) ? source.path : resolve(dirname(configurationPath), source.path);
    await stat(sourcePath);
    report.push({ topicId: source.topicId, id: source.id, kind: "file", path: source.path, status: "approved-local" });
    continue;
  }
  if ((source.kind ?? "url") !== "url") {
    report.push({ topicId: source.topicId, id: source.id, kind: source.kind ?? "url", status: "not-applicable" });
    continue;
  }
  assertDeclaredCompliance(source);
  if (!source.url) throw new Error(`URL이 없습니다: ${source.id ?? "id 없음"}`);
  await waitForSourceInterval(source);
  await assertRobotsAllowed(source.url);
  report.push({
    id: source.id,
    topicId: source.topicId,
    kind: "url",
    url: source.url,
    status: "approved",
    reviewedAt: source.compliance?.reviewedAt,
    minIntervalMs: source.compliance?.minIntervalMs
  });
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  totalSources: report.length,
  externalSources: report.filter((item) => item.kind === "url").length,
  sources: report
}, null, 2));
