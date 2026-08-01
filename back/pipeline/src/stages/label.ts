import { join } from "node:path";
import { dataRoot, readJson, writeJson } from "./common.js";
import type { RawDocument } from "./types.js";

const labelRules: Record<string, string[]> = {
  battle: ["battle", "war", "siege", "invasion", "campaign", "army", "navy", "combat", "attack", "defense", "전쟁", "전투", "침공", "공격", "방어", "수군", "육군", "의병", "군대", "전역"],
  people: ["king", "queen", "general", "admiral", "soldier", "emperor", "minister", "witness", "biography", "왕", "장군", "제독", "군인", "황제", "신하", "증언", "인물", "지휘관", "사절"],
  place: ["province", "city", "fortress", "castle", "river", "sea", "border", "route", "map", "region", "지역", "도시", "성", "성곽", "강", "해상", "국경", "경로", "지도", "장소"],
  diplomacy: ["treaty", "truce", "envoy", "diplomacy", "negotiation", "alliance", "peace", "조약", "휴전", "사신", "외교", "교섭", "동맹", "강화", "평화"],
  "primary-source": ["archive", "record", "letter", "diary", "manuscript", "document", "memoir", "collection", "사료", "기록", "문서", "서신", "일기", "원문", "자료", "소장품"],
  chronology: ["century", "year", "timeline", "dated", "period", "era", "세기", "연도", "연표", "시기", "시대", "기간", "년"]
};

const historyKeywords = [
  "history", "historical", "archive", "record", "war", "battle", "king", "dynasty", "empire",
  "treaty", "museum", "library", "manuscript", "chronology", "invasion", "memorial",
  "역사", "사료", "기록", "전쟁", "전투", "왕", "왕조", "제국", "조약", "박물관",
  "도서관", "문서", "연표", "침공", "기념", "인물", "장소", "외교"
];

const trustedSourcePatterns: Array<[RegExp, number]> = [
  [/\.gov\b|\.go\./, 0.95],
  [/\.edu\b|\.ac\./, 0.9],
  [/loc\.gov|si\.edu|europeana\.eu|dp\.la|wikidata\.org|archive\.org/, 0.88],
  [/archive|archives|museum|library|collection|record/, 0.78],
  [/internal:\/\//, 0.68]
];

function textFor(document: RawDocument): string {
  return `${document.title} ${document.content} ${document.sourceUrl}`.toLowerCase();
}

function labelsFor(content: string): string[] {
  const labels = Object.entries(labelRules)
    .filter(([, keywords]) => keywords.some((keyword) => content.includes(keyword)))
    .map(([label]) => label);
  return labels.length > 0 ? labels : ["unclassified"];
}

function sourceReliabilityScore(document: RawDocument): number {
  const source = document.sourceUrl.toLowerCase();
  const matched = trustedSourcePatterns.find(([pattern]) => pattern.test(source));
  return matched ? matched[1] : 0.42;
}

function reliabilityFor(score: number): RawDocument["reliability"] {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "needs-review";
}

function relevanceFor(content: string): number {
  const hits = historyKeywords.filter((keyword) => content.includes(keyword)).length;
  const yearSignal = /\b(?:1[0-9]{3}|20[0-2][0-9])\b/.test(content) ? 0.18 : 0;
  const labelSignal = labelsFor(content).includes("unclassified") ? 0 : 0.18;
  const contentFloor = content.length >= 120 ? 0.32 : 0;
  return Math.min(1, Number(Math.max((hits / historyKeywords.length) + yearSignal + labelSignal, contentFloor).toFixed(2)));
}

function contextGroupFor(labels: string[]): string {
  if (labels.includes("battle") || labels.includes("place")) return "event-place";
  if (labels.includes("people")) return "people-testimony";
  if (labels.includes("diplomacy")) return "diplomacy-aftermath";
  if (labels.includes("primary-source")) return "source-record";
  return "review";
}

export async function label(): Promise<{ stage: string; total: number; documents: RawDocument[] }> {
  const payload = await readJson<{ documents?: RawDocument[] }>(join(dataRoot(), "raw", "documents.json"));
  if (!Array.isArray(payload.documents)) throw new Error("raw documents must be an array.");
  const documents = payload.documents.map((document) => {
    const content = textFor(document);
    const labels = labelsFor(content);
    const sourceScore = sourceReliabilityScore(document);
    return {
      ...document,
      labels,
      reliability: reliabilityFor(sourceScore),
      sourceReliabilityScore: sourceScore,
      relevanceScore: relevanceFor(content),
      contextGroup: contextGroupFor(labels),
      labelingVersion: "rules-v3-trust-filter"
    };
  });
  const result = { stage: "labeled", total: documents.length, documents };
  await writeJson(join(dataRoot(), "labeled", "documents.json"), result);
  return result;
}
