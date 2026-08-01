import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertDeclaredCompliance, assertRobotsAllowed, waitForSourceInterval } from "../compliance.js";
import { dataRoot, readJson, writeJson } from "./common.js";
import type { RawDocument, SourceDefinition } from "./types.js";

export type SourceFailure = {
  sourceId: string;
  sourceUrl?: string;
  message: string;
};

type FetchedDocument = {
  id?: string;
  title?: string;
  sourceUrl?: string;
  content: string;
};

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

function getPath(value: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((current, part) => {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
    if (typeof current === "object") return (current as Record<string, unknown>)[part];
    return undefined;
  }, value);
}

function textFrom(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(textFrom).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(textFrom).filter(Boolean).join(" ");
  return String(value).trim();
}

function interpolateEnv(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, key: string) => process.env[key] ?? "");
}

function maxItemsPerSource(source: SourceDefinition): number {
  const configured = Number(process.env.COLLECTION_MAX_ITEMS_PER_SOURCE ?? source.api?.maxItems ?? 100);
  if (!Number.isFinite(configured) || configured < 1) return source.api?.maxItems ?? 100;
  return Math.min(500, Math.floor(configured));
}

async function fetchApiDocuments(source: SourceDefinition): Promise<FetchedDocument[]> {
  if (!source.url?.startsWith("http://") && !source.url?.startsWith("https://")) {
    throw new Error("API 소스는 http:// 또는 https:// 주소가 필요합니다.");
  }
  if (!source.api) throw new Error(`api-json source에는 api 설정이 필요합니다: ${source.id ?? "id 없음"}`);
  if (source.requiredEnv && !process.env[source.requiredEnv]) return [];

  assertDeclaredCompliance(source);
  const endpoint = interpolateEnv(source.url);
  await waitForSourceInterval(source);
  const response = await fetch(endpoint, {
    headers: { "user-agent": "WarArchiveBot/0.1 (+research archive)", accept: "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`API 수집 실패: ${response.status} ${endpoint}`);
  const payload = await response.json() as unknown;
  const items = getPath(payload, source.api.itemPath);
  if (!Array.isArray(items)) return [];
  const maxItems = maxItemsPerSource(source);
  return items.slice(0, maxItems).map((item, index) => {
    const title = textFrom(getPath(item, source.api?.titlePath)).slice(0, 180) || source.title || `API 기록 ${index + 1}`;
    const content = source.api?.contentPaths.map((path) => textFrom(getPath(item, path))).filter(Boolean).join("\n");
    const sourceUrl = textFrom(getPath(item, source.api?.urlPath)) || endpoint;
    const id = textFrom(getPath(item, source.api?.idPath)) || `${source.id ?? "api"}-${index + 1}`;
    return { id, title, sourceUrl, content: stripHtml(content || title) };
  }).filter((document) => document.content.length > 0);
}

async function fetchSource(source: SourceDefinition): Promise<FetchedDocument[]> {
  const kind = source.kind ?? "url";
  if (kind === "api-json") return fetchApiDocuments(source);
  if (kind === "inline") return [{ id: source.id, title: source.title, sourceUrl: source.url, content: source.content?.trim() ?? "" }];
  if (kind === "file") {
    if (!source.path) throw new Error(`file source path가 없습니다: ${source.id ?? "id 없음"}`);
    return [{ id: source.id, title: source.title, sourceUrl: source.url, content: (await readFile(source.path, "utf-8")).trim() }];
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
  return [{ id: source.id, title: source.title, sourceUrl: source.url, content: stripHtml((await response.text()).slice(0, 2_000_000)) }];
}

export async function crawl(sources: SourceDefinition[]): Promise<{
  stage: string;
  total: number;
  added: number;
  sourceFailures: SourceFailure[];
  documents: RawDocument[];
}> {
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
  const knownHashes = new Set(existing.map((document) => createHash("sha256").update(document.content).digest("hex").slice(0, 16)));
  const existingBySource = new Map(existing.filter((document) => document.sourceUrl).map((document) => [document.sourceUrl, document]));
  const seenSourcesThisCycle = new Set<string>();
  const sourceFailures: SourceFailure[] = [];
  let added = 0;
  for (const [index, source] of sources.entries()) {
    let fetchedDocuments: FetchedDocument[];
    try {
      fetchedDocuments = await fetchSource(source);
    } catch (error) {
      sourceFailures.push({
        sourceId: source.id ?? `source-${index + 1}`,
        sourceUrl: source.url,
        message: error instanceof Error ? error.message : String(error)
      });
      continue;
    }
    if (fetchedDocuments.length === 0) continue;
    for (const [documentIndex, fetched] of fetchedDocuments.entries()) {
    const content = fetched.content;
    if (!content) throw new Error(`sources[${index}]에서 본문을 얻지 못했습니다.`);
    const contentHash = createHash("sha256").update(content).digest("hex").slice(0, 16);
    const id = `${source.id ?? "source"}-${fetched.id ?? documentIndex + 1}`.replace(/[^0-9A-Za-z_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || contentHash;
    const sourceUrl = fetched.sourceUrl ?? source.url ?? "";
    if (sourceUrl && seenSourcesThisCycle.has(sourceUrl)) continue;
    const existingForSource = sourceUrl ? existingBySource.get(sourceUrl) : undefined;
    if (existingForSource) {
      const existingHash = existingForSource.contentHash ?? createHash("sha256").update(existingForSource.content).digest("hex").slice(0, 16);
      if (existingHash === contentHash) {
        if (sourceUrl) seenSourcesThisCycle.add(sourceUrl);
        continue;
      }
      const fragments = changedFragments(existingForSource.content, content);
      const nextContent = fragments.length > 0 ? fragments.join("\n\n") : content;
      const existingIndex = documents.findIndex((document) => document.id === existingForSource.id);
      const updatedDocument = {
        ...existingForSource,
        title: fetched.title ?? existingForSource.title,
        period: source.period ?? existingForSource.period,
        region: source.region ?? existingForSource.region,
        content: nextContent,
        contentHash,
        previousContentHash: existingHash,
        changeKind: "updated" as const,
        changeSummary: {
          mode: fragments.length > 0 ? "added-fragments" as const : "full" as const,
          addedFragments: fragments,
          previousLength: existingForSource.content.length,
          nextLength: content.length
        },
        updatedAt: new Date().toISOString()
      };
      if (existingIndex >= 0) documents[existingIndex] = updatedDocument;
      existingBySource.set(sourceUrl, updatedDocument);
      seenSourcesThisCycle.add(sourceUrl);
      knownHashes.add(contentHash);
      added += 1;
      continue;
    }
    if (knownIds.has(id) || knownHashes.has(contentHash)) {
      if (sourceUrl) seenSourcesThisCycle.add(sourceUrl);
      continue;
    }
    documents.push({
      id,
      topicId: source.topicId ?? id,
      title: fetched.title ?? source.title ?? `수집 문서 ${index + 1}`,
      period: source.period ?? "미분류",
      region: source.region ?? "미분류",
      sourceUrl,
      content,
      contentHash,
      changeKind: "new",
      collectedAt: new Date().toISOString()
    });
    knownIds.add(id);
    knownHashes.add(contentHash);
    if (sourceUrl) {
      existingBySource.set(sourceUrl, documents[documents.length - 1]);
      seenSourcesThisCycle.add(sourceUrl);
    }
    added += 1;
    }
  }

  const result = { stage: "crawled", total: documents.length, added, sourceFailures, documents };
  await writeJson(outputPath, result);
  return result;
}

function contentUnits(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((unit) => unit.replace(/\s+/g, " ").trim())
    .filter((unit) => unit.length >= 8);
}

function changedFragments(previous: string, next: string): string[] {
  const previousUnits = new Set(contentUnits(previous));
  return contentUnits(next)
    .filter((unit) => !previousUnits.has(unit))
    .slice(0, 120);
}
