import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crawl, type SourceFailure } from "./stages/crawl.js";
import { clusterByEventTitle } from "./stages/cluster.js";
import { informationize } from "./stages/informationize.js";
import { label } from "./stages/label.js";
import { dataRoot, readJson, writeJson } from "./stages/common.js";
import type { SourceDefinition, TopicDefinition } from "./stages/types.js";

export type CollectionState = {
  version: 1;
  lastCollectedAt?: string;
  lastAttemptedAt?: string;
  lastError?: string;
  lastPartialErrors?: SourceFailure[];
  sourceCursors?: Record<string, number>;
  collectedTopicIds: string[];
};

const emptyState = (): CollectionState => ({ version: 1, collectedTopicIds: [] });

export function topicsPath(): string {
  return process.env.WAR_ARCHIVE_TOPICS_PATH
    ?? fileURLToPath(new URL("../config/topics.json", import.meta.url));
}

export function collectionStatePath(): string {
  return join(dataRoot(), "state", "collection.json");
}

export async function loadCollectionState(): Promise<CollectionState> {
  try {
    return await readJson<CollectionState>(collectionStatePath());
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

function validateTopic(topic: TopicDefinition): void {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(topic.id) || !Array.isArray(topic.sources) || topic.sources.length === 0) {
    throw new Error(`주제 설정이 올바르지 않습니다: ${topic.id}`);
  }
}

function sourcesForTopic(topic: TopicDefinition, configurationPath: string): SourceDefinition[] {
  return topic.sources.map((source, index) => ({
    ...source,
    id: `${topic.id}-${source.id ?? index + 1}`,
    path: source.kind === "file" && source.path && !isAbsolute(source.path)
      ? resolve(dirname(configurationPath), source.path)
      : source.path,
    topicId: topic.id,
    title: topic.title,
    period: topic.period,
    region: topic.region
  }));
}

function sourceCursorKey(source: SourceDefinition): string {
  return source.id ?? `${source.topicId ?? "topic"}:${source.url ?? source.path ?? "source"}`;
}

function apiPagesPerRun(source: SourceDefinition): number {
  const configured = Number(process.env.COLLECTION_API_PAGES_PER_SOURCE ?? source.api?.pagination?.pagesPerRun ?? 2);
  if (!Number.isFinite(configured) || configured < 1) return 1;
  return Math.min(10, Math.floor(configured));
}

function withQueryParam(url: string, param: string, value: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set(param, String(value));
  return preserveEnvPlaceholders(parsed.toString());
}

function withSparqlOffset(url: string, offset: number): string {
  const parsed = new URL(url);
  const query = parsed.searchParams.get("query") ?? "";
  const nextQuery = `${query.replace(/\s+OFFSET\s+\d+\s*$/i, "").trim()} OFFSET ${offset}`;
  parsed.searchParams.set("query", nextQuery);
  return preserveEnvPlaceholders(parsed.toString());
}

function preserveEnvPlaceholders(url: string): string {
  return url.replace(/\$%7B([A-Z0-9_]+)%7D/gi, (_match, key: string) => `\${${key}}`);
}

function withApiCursor(source: SourceDefinition, cursor: number): SourceDefinition {
  const pagination = source.api?.pagination;
  if (!pagination || !source.url) return source;
  const url = pagination.strategy === "sparql-offset"
    ? withSparqlOffset(source.url, cursor)
    : withQueryParam(source.url, pagination.param ?? "page", cursor);
  return {
    ...source,
    id: `${source.id ?? "api"}-cursor-${cursor}`,
    url
  };
}

type CursorAdvance = {
  key: string;
  next: number;
  sourceIds: string[];
};

function expandApiSourcesWithCursors(sources: SourceDefinition[], state: CollectionState): {
  sources: SourceDefinition[];
  cursorAdvances: CursorAdvance[];
} {
  const expanded: SourceDefinition[] = [];
  const cursorAdvances: CursorAdvance[] = [];
  for (const source of sources) {
    const pagination = source.api?.pagination;
    if (source.kind !== "api-json" || !pagination || (source.requiredEnv && !process.env[source.requiredEnv])) {
      expanded.push(source);
      continue;
    }
    const key = sourceCursorKey(source);
    const start = Number.isFinite(pagination.start) ? Number(pagination.start) : 1;
    const step = Number.isFinite(pagination.step) ? Number(pagination.step) : 1;
    const current = state.sourceCursors?.[key] ?? start;
    const pages = apiPagesPerRun(source);
    const sourceIds: string[] = [];
    for (let page = 0; page < pages; page += 1) {
      const pagedSource = withApiCursor(source, current + (page * step));
      expanded.push(pagedSource);
      sourceIds.push(pagedSource.id ?? sourceCursorKey(pagedSource));
    }
    cursorAdvances.push({ key, next: current + (pages * step), sourceIds });
  }
  return { sources: expanded, cursorAdvances };
}

function nextSourceCursors(state: CollectionState, cursorAdvances: CursorAdvance[], failures: SourceFailure[]): Record<string, number> {
  const failedSourceIds = new Set(failures.map((failure) => failure.sourceId));
  const next = { ...(state.sourceCursors ?? {}) };
  for (const cursorAdvance of cursorAdvances) {
    if (cursorAdvance.sourceIds.some((sourceId) => failedSourceIds.has(sourceId))) continue;
    next[cursorAdvance.key] = cursorAdvance.next;
  }
  return next;
}

function shuffledSources(sources: SourceDefinition[]): SourceDefinition[] {
  if (process.env.COLLECTION_SHUFFLE_SOURCES === "false") return sources;
  const shuffled = [...sources];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export async function collectSourceCycle(): Promise<{
  collected: boolean;
  topicIds: string[];
  attemptedSources: number;
  addedDocuments: number;
  failedSources: number;
  totalRecords: number;
}> {
  const state = await loadCollectionState();
  state.lastAttemptedAt = new Date().toISOString();
  try {
    const configurationPath = topicsPath();
    const configuration = await readJson<{ topics?: TopicDefinition[] }>(configurationPath);
    if (!Array.isArray(configuration.topics)) throw new Error("topics가 배열이 아닙니다.");
    const topics = configuration.topics;
    if (topics.length === 0) {
      delete state.lastError;
      await writeJson(collectionStatePath(), state);
      return { collected: false, topicIds: [], attemptedSources: 0, addedDocuments: 0, failedSources: 0, totalRecords: 0 };
    }
    topics.forEach(validateTopic);

    const baseSources = topics.flatMap((topic) => sourcesForTopic(topic, configurationPath));
    const expandedSources = expandApiSourcesWithCursors(baseSources, state);
    const sources = shuffledSources(expandedSources.sources);
    const crawlResult = await crawl(sources);
    state.sourceCursors = nextSourceCursors(state, expandedSources.cursorAdvances, crawlResult.sourceFailures);
    if (crawlResult.sourceFailures.length > 0) state.lastPartialErrors = crawlResult.sourceFailures.slice(-10);
    else delete state.lastPartialErrors;
    if (crawlResult.total === 0 && crawlResult.sourceFailures.length > 0) {
      throw new Error(`모든 수집 소스가 실패했습니다: ${crawlResult.sourceFailures.map((failure) => failure.sourceId).join(", ")}`);
    }
    await label();
    await clusterByEventTitle();
    const result = await informationize();
    state.collectedTopicIds = [...new Set([...state.collectedTopicIds, ...topics.map((topic) => topic.id)])];
    state.lastCollectedAt = new Date().toISOString();
    delete state.lastError;
    await writeJson(collectionStatePath(), state);
    return {
      collected: true,
      topicIds: topics.map((topic) => topic.id),
      attemptedSources: sources.length,
      addedDocuments: crawlResult.added,
      failedSources: crawlResult.sourceFailures.length,
      totalRecords: result.total
    };
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    await writeJson(collectionStatePath(), state);
    throw error;
  }
}

export async function collectNextTopic(): Promise<{ collected: boolean; topicId?: string; totalRecords?: number }> {
  const result = await collectSourceCycle();
  return {
    collected: result.collected,
    topicId: result.topicIds[0],
    totalRecords: result.totalRecords
  };
}
