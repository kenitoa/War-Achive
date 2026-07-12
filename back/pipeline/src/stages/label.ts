import { join } from "node:path";
import { dataRoot, readJson, writeJson } from "./common.js";
import type { RawDocument } from "./types.js";

const labelRules: Record<string, string[]> = {
  "전투": ["전투", "교전", "공격", "방어"],
  "인물": ["장군", "지휘관", "왕", "황제", "대통령"],
  "지역": ["지역", "도시", "국경", "해협", "반도"],
  "외교": ["조약", "협정", "외교", "평화", "휴전"],
  "사료": ["사료", "기록", "문서", "증언", "출처"]
};
const historyKeywords = ["전쟁", "역사", "사료", "자료", "전투", "인물", "지역", "외교", "기록", "문서", "증언", "협정"];

function labelsFor(content: string): string[] {
  const labels = Object.entries(labelRules)
    .filter(([, keywords]) => keywords.some((keyword) => content.includes(keyword)))
    .map(([label]) => label);
  return labels.length > 0 ? labels : ["미분류"];
}

function reliabilityFor(document: RawDocument): RawDocument["reliability"] {
  const url = document.sourceUrl.toLowerCase();
  if (url.startsWith("internal://")) return "medium";
  if (/\.(go|gov|ac|edu)\.|archives?|museum|library|record|history/.test(url)) return "high";
  return "needs-review";
}

function relevanceFor(content: string): number {
  const hits = historyKeywords.filter((keyword) => content.includes(keyword)).length;
  return Math.min(1, Number((hits / historyKeywords.length).toFixed(2)));
}

function contextGroupFor(labels: string[]): string {
  if (labels.includes("전투") || labels.includes("지역")) return "사건·공간";
  if (labels.includes("인물")) return "인물·증언";
  if (labels.includes("외교")) return "외교·전후처리";
  if (labels.includes("사료")) return "원문·사료";
  return "검토 대기";
}

export async function label(): Promise<{ stage: string; total: number; documents: RawDocument[] }> {
  const payload = await readJson<{ documents?: RawDocument[] }>(join(dataRoot(), "raw", "documents.json"));
  if (!Array.isArray(payload.documents)) throw new Error("크롤링 산출물의 documents가 배열이 아닙니다.");
  const documents = payload.documents.map((document) => ({
    ...document,
    labels: labelsFor(document.content),
    reliability: reliabilityFor(document),
    relevanceScore: relevanceFor(document.content),
    contextGroup: contextGroupFor(labelsFor(document.content)),
    labelingVersion: "rules-v2"
  }));
  const result = { stage: "labeled", total: documents.length, documents };
  await writeJson(join(dataRoot(), "labeled", "documents.json"), result);
  return result;
}
