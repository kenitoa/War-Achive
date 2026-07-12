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

function labelsFor(content: string): string[] {
  const labels = Object.entries(labelRules)
    .filter(([, keywords]) => keywords.some((keyword) => content.includes(keyword)))
    .map(([label]) => label);
  return labels.length > 0 ? labels : ["미분류"];
}

export async function label(): Promise<{ stage: string; total: number; documents: RawDocument[] }> {
  const payload = await readJson<{ documents?: RawDocument[] }>(join(dataRoot(), "raw", "documents.json"));
  if (!Array.isArray(payload.documents)) throw new Error("크롤링 산출물의 documents가 배열이 아닙니다.");
  const documents = payload.documents.map((document) => ({
    ...document,
    labels: labelsFor(document.content),
    labelingVersion: "rules-v1"
  }));
  const result = { stage: "labeled", total: documents.length, documents };
  await writeJson(join(dataRoot(), "labeled", "documents.json"), result);
  return result;
}
