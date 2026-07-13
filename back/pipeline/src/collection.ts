import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crawl } from "./stages/crawl.js";
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
  totalRecords: number;
}> {
  const configurationPath = topicsPath();
  const configuration = await readJson<{ topics?: TopicDefinition[] }>(configurationPath);
  if (!Array.isArray(configuration.topics)) throw new Error("topics가 배열이 아닙니다.");
  const state = await loadCollectionState();
  const topics = configuration.topics;
  if (topics.length === 0) return { collected: false, topicIds: [], attemptedSources: 0, addedDocuments: 0, totalRecords: 0 };
  topics.forEach(validateTopic);

  const sources = shuffledSources(topics.flatMap((topic) => sourcesForTopic(topic, configurationPath)));
  const crawlResult = await crawl(sources);
  await label();
  await clusterByEventTitle();
  const result = await informationize();
  state.collectedTopicIds = [...new Set([...state.collectedTopicIds, ...topics.map((topic) => topic.id)])];
  state.lastAttemptedAt = new Date().toISOString();
  state.lastCollectedAt = new Date().toISOString();
  delete state.lastError;
  await writeJson(collectionStatePath(), state);
  return {
    collected: true,
    topicIds: topics.map((topic) => topic.id),
    attemptedSources: sources.length,
    addedDocuments: crawlResult.added,
    totalRecords: result.total
  };
}

export async function collectNextTopic(): Promise<{ collected: boolean; topicId?: string; totalRecords?: number }> {
  const result = await collectSourceCycle();
  return {
    collected: result.collected,
    topicId: result.topicIds[0],
    totalRecords: result.totalRecords
  };
}
