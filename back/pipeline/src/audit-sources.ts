import { assertDeclaredCompliance, assertRobotsAllowed, waitForSourceInterval } from "./compliance.js";
import { topicsPath } from "./collection.js";
import { readJson } from "./stages/common.js";
import type { SourceDefinition, TopicDefinition } from "./stages/types.js";

const configuration = await readJson<{ topics?: TopicDefinition[] }>(topicsPath());
if (!Array.isArray(configuration.topics)) throw new Error("topics가 배열이 아닙니다.");
const sources: Array<SourceDefinition & { topicId: string }> = configuration.topics
  .flatMap((topic) => topic.sources.map((source) => ({ ...source, topicId: topic.id })));

const report: Array<Record<string, unknown>> = [];
for (const source of sources) {
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
