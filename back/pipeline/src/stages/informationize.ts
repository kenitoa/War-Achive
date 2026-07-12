import { join } from "node:path";
import { dataRoot, readJson, writeJson } from "./common.js";
import type { RawDocument } from "./types.js";

function summarize(content: string, limit = 420): string {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length <= limit ? compact : `${compact.slice(0, limit).trimEnd()}…`;
}

function indexedTermCount(text: string): number {
  return new Set((text.match(/[0-9A-Za-z가-힣]{2,}/g) ?? []).map((token) => token.toLowerCase())).size;
}

export async function informationize() {
  const labeled = await readJson<{ documents?: RawDocument[] }>(join(dataRoot(), "labeled", "documents.json"));
  if (!Array.isArray(labeled.documents)) throw new Error("라벨링 산출물 형식이 올바르지 않습니다.");

  const grouped = new Map<string, RawDocument[]>();
  for (const document of labeled.documents) {
    const group = grouped.get(document.topicId) ?? [];
    group.push(document);
    grouped.set(document.topicId, group);
  }

  const items = [...grouped.entries()].map(([topicId, documents]) => {
    const primary = documents[0];
    const combinedContent = documents.map((document) => document.content).join("\n\n");
    const sourceUrls = [...new Set(documents.map((document) => document.sourceUrl).filter(Boolean))];
    return {
      id: topicId,
      title: primary.title || "제목 없음",
      period: primary.period || "미분류",
      region: primary.region || "미분류",
      summary: summarize(combinedContent),
      labels: [...new Set(documents.flatMap((document) => document.labels ?? ["미분류"]))],
      sourceUrl: sourceUrls[0] ?? "",
      sourceUrls,
      sourceCount: sourceUrls.length,
      documentCount: documents.length,
      indexedTerms: indexedTermCount(combinedContent),
      collectedAt: documents.map((document) => document.collectedAt).sort()[0]
    };
  });
  const result = { stage: "informationized", total: items.length, items };
  await writeJson(join(dataRoot(), "informationized", "records.json"), result);
  return result;
}
