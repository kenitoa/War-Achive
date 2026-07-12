import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { crawl } from "./stages/crawl.js";
import { informationize } from "./stages/informationize.js";
import { label } from "./stages/label.js";
import { dataRoot, readJson, writeJson } from "./stages/common.js";
import type { SourceDefinition, TopicDefinition } from "./stages/types.js";

export type CollectionState = {
  version: 1;
  lastCollectedAt?: string;
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

export async function collectNextTopic(): Promise<{ collected: boolean; topicId?: string; totalRecords?: number }> {
  const configuration = await readJson<{ topics?: TopicDefinition[] }>(topicsPath());
  if (!Array.isArray(configuration.topics)) throw new Error("topics가 배열이 아닙니다.");
  const state = await loadCollectionState();
  const topic = configuration.topics.find((candidate) => !state.collectedTopicIds.includes(candidate.id));
  if (!topic) return { collected: false };
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(topic.id) || !Array.isArray(topic.sources) || topic.sources.length === 0) {
    throw new Error(`주제 설정이 올바르지 않습니다: ${topic.id}`);
  }

  const sources: SourceDefinition[] = topic.sources.map((source, index) => ({
    ...source,
    id: `${topic.id}-${source.id ?? index + 1}`,
    topicId: topic.id,
    title: topic.title,
    period: topic.period,
    region: topic.region
  }));

  await crawl(sources);
  await label();
  const result = await informationize();
  state.collectedTopicIds.push(topic.id);
  state.lastCollectedAt = new Date().toISOString();
  await writeJson(collectionStatePath(), state);
  return { collected: true, topicId: topic.id, totalRecords: result.total };
}
