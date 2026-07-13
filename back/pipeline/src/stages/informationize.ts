import { join } from "node:path";
import { dataRoot, readJson, writeJson } from "./common.js";
import type { RawDocument } from "./types.js";

function summarize(content: string, limit = 420): string {
  const compact = content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length <= limit ? compact : `${compact.slice(0, limit).trimEnd()}…`;
}

function indexedTermCount(text: string): number {
  return new Set((text.match(/[0-9A-Za-z가-힣]{2,}/g) ?? []).map((token) => token.toLowerCase())).size;
}

function rounded(value: number): number {
  return Number(value.toFixed(2));
}

function sentences(content: string): string[] {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .split(/(?<=[.!?。！？]|[다요]\.)\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length > 0);
}

function pickSentences(items: string[], predicate: (sentence: string) => boolean, fallback: string[], limit: number): string[] {
  const picked = items.filter(predicate).slice(0, limit);
  return picked.length > 0 ? picked : fallback.slice(0, limit);
}

function curatorRecord(args: {
  combinedContent: string;
  documents: RawDocument[];
  labels: string[];
  sourceUrls: string[];
}) {
  const allSentences = sentences(args.combinedContent);
  const fallback = allSentences.length > 0 ? allSentences : [summarize(args.combinedContent, 180)];
  const chronology = pickSentences(
    allSentences,
    (sentence) => /\d{3,4}년|\d{3,4}/.test(sentence) || /시작|이어|지속|전후|재침공/.test(sentence),
    fallback,
    3
  );
  const peopleAndPlaces = pickSentences(
    allSentences,
    (sentence) => /인물|지휘관|의병|수군|피난민|사절|장소|지역|한산도|진주성|평양|행주산성|부산포/.test(sentence),
    fallback,
    3
  );
  const keyPoints = pickSentences(
    allSentences,
    (sentence) => /전투|외교|교섭|피해|복구|중복|라벨링|분류|정보화/.test(sentence),
    fallback,
    4
  );
  const averageRelevance = args.documents.reduce((sum, document) => sum + (document.relevanceScore ?? 0), 0) / Math.max(1, args.documents.length);
  const reliabilityCounts = args.documents.reduce<Record<string, number>>((counts, document) => {
    const key = document.reliability ?? "needs-review";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const contextGroups = [...new Set(args.documents.map((document) => document.contextGroup).filter(Boolean))];
  return {
    format: "history-curator-v1" as const,
    context: summarize(args.combinedContent, 260),
    keyPoints,
    chronology,
    peopleAndPlaces,
    sourceBasis: `등록 출처 ${args.sourceUrls.length}건과 수집 문서 ${args.documents.length}건을 중복 제거한 뒤 ${args.labels.join(", ")} 라벨로 분류했습니다. 맥락 그룹은 ${contextGroups.join(", ") || "검토 대기"}이며 평균 연관성은 ${averageRelevance.toFixed(2)}, 신뢰도 분포는 high ${reliabilityCounts.high ?? 0}건, medium ${reliabilityCounts.medium ?? 0}건, needs-review ${reliabilityCounts["needs-review"] ?? 0}건입니다.`
  };
}

function qualityScore(args: {
  documentCount: number;
  sourceCount: number;
  averageRelevance: number;
  mediumOrBetterReliability: number;
  curatorComplete: boolean;
}): number {
  const sourceFactor = Math.min(1, args.sourceCount / 3);
  const documentFactor = Math.min(1, args.documentCount / 3);
  const reliabilityFactor = args.mediumOrBetterReliability / Math.max(1, args.documentCount);
  const curatorFactor = args.curatorComplete ? 1 : 0;
  return rounded((sourceFactor * 0.2) + (documentFactor * 0.15) + (args.averageRelevance * 0.25) + (reliabilityFactor * 0.25) + (curatorFactor * 0.15));
}

export async function informationize() {
  let payload: { documents?: RawDocument[] };
  try {
    payload = await readJson<{ documents?: RawDocument[] }>(join(dataRoot(), "clustered", "documents.json"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    payload = await readJson<{ documents?: RawDocument[] }>(join(dataRoot(), "labeled", "documents.json"));
  }
  const labeled = payload;
  if (!Array.isArray(labeled.documents)) throw new Error("라벨링 산출물 형식이 올바르지 않습니다.");

  const publishableDocuments = labeled.documents.filter((document) => document.qualityDecision !== "rejected");
  const grouped = new Map<string, RawDocument[]>();
  for (const document of publishableDocuments) {
    const groupId = document.eventClusterId ?? document.topicId;
    const group = grouped.get(groupId) ?? [];
    group.push(document);
    grouped.set(groupId, group);
  }

  const items = [...grouped.entries()].map(([topicId, documents]) => {
    const primary = documents[0];
    const combinedContent = documents.map((document) => document.content).join("\n\n");
    const sourceUrls = [...new Set(documents.map((document) => document.sourceUrl).filter(Boolean))];
    const labels = [...new Set(documents.flatMap((document) => document.labels ?? ["미분류"]))];
    const curator = curatorRecord({ combinedContent, documents, labels, sourceUrls });
    const averageRelevance = documents.reduce((sum, document) => sum + (document.relevanceScore ?? 0), 0) / Math.max(1, documents.length);
    const mediumOrBetterReliability = documents.filter((document) => document.reliability === "high" || document.reliability === "medium").length;
    const algorithmQuality = documents.reduce((sum, document) => sum + (document.qualityScore ?? 0.5), 0) / Math.max(1, documents.length);
    const score = rounded((qualityScore({
      documentCount: documents.length,
      sourceCount: sourceUrls.length,
      averageRelevance,
      mediumOrBetterReliability,
      curatorComplete: curator.keyPoints.length > 0 && curator.chronology.length > 0 && curator.peopleAndPlaces.length > 0
    }) * 0.55) + (algorithmQuality * 0.45));
    return {
      id: topicId,
      title: primary.eventClusterTitle || primary.title || "제목 없음",
      period: primary.period || "미분류",
      region: primary.region || "미분류",
      summary: summarize(combinedContent),
      curator,
      labels,
      sourceUrl: sourceUrls[0] ?? "",
      sourceUrls,
      documentIds: documents.map((document) => document.id),
      sentenceIds: [...new Set(documents.flatMap((document) => document.sentenceIds ?? []))],
      sourceCount: sourceUrls.length,
      documentCount: documents.length,
      indexedTerms: indexedTermCount(combinedContent),
      qualityScore: score,
      qualityGate: {
        minScore: 0.6,
        passed: score >= 0.6,
        reason: score >= 0.6 ? "발행 품질 기준 통과" : "출처 수, 연관성, 신뢰도 또는 큐레이터 구성 보강 필요"
      },
      collectedAt: documents.map((document) => document.collectedAt).sort()[0]
    };
  });
  const result = { stage: "informationized", total: items.length, items };
  await writeJson(join(dataRoot(), "informationized", "records.json"), result);
  return result;
}
