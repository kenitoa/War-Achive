import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertDeclaredCompliance, assertRobotsAllowed, waitForSourceInterval } from "../compliance.js";
import { dataRoot, readJson, writeJson } from "./common.js";
import type { RawDocument, SourceDefinition } from "./types.js";

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSource(source: SourceDefinition): Promise<string> {
  const kind = source.kind ?? "url";
  if (kind === "inline") return source.content?.trim() ?? "";
  if (kind === "file") {
    if (!source.path) throw new Error(`file source path가 없습니다: ${source.id ?? "id 없음"}`);
    return (await readFile(source.path, "utf-8")).trim();
  }
  if (kind !== "url") throw new Error(`지원하지 않는 source kind: ${String(kind)}`);
  if (!source.url?.startsWith("http://") && !source.url?.startsWith("https://")) {
    throw new Error("URL 소스는 http:// 또는 https:// 주소가 필요합니다.");
  }

  assertDeclaredCompliance(source);
  await waitForSourceInterval(source);
  await assertRobotsAllowed(source.url);
  await waitForSourceInterval(source);
  const response = await fetch(source.url, {
    headers: { "user-agent": "WarArchiveBot/0.1 (+research archive)" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`크롤링 실패: ${response.status} ${source.url}`);
  return stripHtml((await response.text()).slice(0, 2_000_000));
}

export async function crawl(sources: SourceDefinition[]): Promise<{ stage: string; total: number; added: number; documents: RawDocument[] }> {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error("역사 주제에 하나 이상의 sources 항목이 필요합니다.");
  }

  const outputPath = join(dataRoot(), "raw", "documents.json");
  let existing: RawDocument[] = [];
  try {
    const payload = await readJson<{ documents?: RawDocument[] }>(outputPath);
    existing = Array.isArray(payload.documents) ? payload.documents : [];
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const documents = [...existing];
  const knownIds = new Set(existing.map((document) => document.id));
  const knownSources = new Set(existing.map((document) => document.sourceUrl).filter(Boolean));
  const knownHashes = new Set(existing.map((document) => createHash("sha256").update(document.content).digest("hex").slice(0, 16)));
  let added = 0;
  for (const [index, source] of sources.entries()) {
    const content = await fetchSource(source);
    if (!content) throw new Error(`sources[${index}]에서 본문을 얻지 못했습니다.`);
    const contentHash = createHash("sha256").update(content).digest("hex").slice(0, 16);
    const id = source.id ?? contentHash;
    if (knownIds.has(id) || knownHashes.has(contentHash) || (source.url && knownSources.has(source.url))) continue;
    documents.push({
      id,
      topicId: source.topicId ?? id,
      title: source.title ?? `수집 문서 ${index + 1}`,
      period: source.period ?? "미분류",
      region: source.region ?? "미분류",
      sourceUrl: source.url ?? "",
      content,
      collectedAt: new Date().toISOString()
    });
    knownIds.add(id);
    knownHashes.add(contentHash);
    if (source.url) knownSources.add(source.url);
    added += 1;
  }

  const result = { stage: "crawled", total: documents.length, added, documents };
  await writeJson(outputPath, result);
  return result;
}
