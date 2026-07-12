import { Buffer } from "node:buffer";
import { join } from "node:path";
import { dataRoot, readJson, writeJson } from "./stages/common.js";

export type ArchiveRecord = {
  id: string;
  title: string;
  period: string;
  region: string;
  summary: string;
  sourceCount: number;
  curator?: {
    format: "history-curator-v1";
    context: string;
    keyPoints: string[];
    chronology: string[];
    peopleAndPlaces: string[];
    sourceBasis: string;
  };
  labels?: string[];
  sourceUrl?: string;
  sourceUrls?: string[];
  documentCount?: number;
  indexedTerms?: number;
  qualityScore?: number;
  qualityGate?: {
    minScore: number;
    passed: boolean;
    reason: string;
  };
  collectedAt?: string;
};

type FrontArchive = { version: 1; items: ArchiveRecord[] };

export type PublicationState = {
  version: 1;
  publishedTopicIds: string[];
  pendingTopicId?: string;
  lastPublishedAt?: string;
};

const emptyState = (): PublicationState => ({ version: 1, publishedTopicIds: [] });

export function publicationStatePath(): string {
  return join(dataRoot(), "state", "publication.json");
}

export function frontArchiveLocalPath(): string | undefined {
  return process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
}

export function processingDelayMs(): number {
  const delay = Number(process.env.PROCESSING_DELAY_MS ?? 10 * 60 * 1000);
  if (!Number.isFinite(delay) || delay < 0) throw new Error("PROCESSING_DELAY_MS는 0 이상이어야 합니다.");
  return delay;
}

export function publicationMinQualityScore(): number {
  const score = Number(process.env.PUBLICATION_MIN_QUALITY_SCORE ?? 0.6);
  if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error("PUBLICATION_MIN_QUALITY_SCORE는 0 이상 1 이하이어야 합니다.");
  return score;
}

function isReadyForPublication(record: ArchiveRecord, now = Date.now()): boolean {
  const collectedAt = record.collectedAt ? Date.parse(record.collectedAt) : Number.NaN;
  if (!Number.isFinite(collectedAt)) return true;
  return now - collectedAt >= processingDelayMs();
}

export async function loadPublicationState(): Promise<PublicationState> {
  try {
    return await readJson<PublicationState>(publicationStatePath());
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

function isArchiveRecord(value: unknown): value is ArchiveRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string"
    && /^[a-zA-Z0-9_-]{1,80}$/.test(record.id)
    && typeof record.title === "string"
    && typeof record.period === "string"
    && typeof record.region === "string"
    && typeof record.summary === "string"
    && typeof record.sourceCount === "number"
    && (record.qualityScore === undefined || typeof record.qualityScore === "number")
    && (record.curator === undefined || isCuratorRecord(record.curator));
}

function isCuratorRecord(value: unknown): value is NonNullable<ArchiveRecord["curator"]> {
  if (!value || typeof value !== "object") return false;
  const curator = value as Record<string, unknown>;
  return curator.format === "history-curator-v1"
    && typeof curator.context === "string"
    && Array.isArray(curator.keyPoints)
    && curator.keyPoints.every((item) => typeof item === "string")
    && Array.isArray(curator.chronology)
    && curator.chronology.every((item) => typeof item === "string")
    && Array.isArray(curator.peopleAndPlaces)
    && curator.peopleAndPlaces.every((item) => typeof item === "string")
    && typeof curator.sourceBasis === "string";
}

export function mergeArchiveRecords(existing: ArchiveRecord[], candidate: ArchiveRecord): ArchiveRecord[] {
  if (!isArchiveRecord(candidate)) throw new Error("front에 게시할 기록 형식이 올바르지 않습니다.");
  if (existing.some((record) => record.id === candidate.id)) return existing;
  return [...existing, candidate];
}

async function pushRecordToLocalArchive(candidate: ArchiveRecord, archivePath: string): Promise<void> {
  let current: FrontArchive = { version: 1, items: [] };
  try {
    const parsed = await readJson<Partial<FrontArchive>>(archivePath);
    if (!Array.isArray(parsed.items) || !parsed.items.every(isArchiveRecord)) {
      throw new Error(`로컬 front archive 형식이 올바르지 않습니다: ${archivePath}`);
    }
    current = { version: 1, items: parsed.items };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const merged = mergeArchiveRecords(current.items, candidate);
  if (merged === current.items) return;
  await writeJson(archivePath, { version: 1, items: merged });
}

function githubHeaders(token: string): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "WarArchivePublisher/1.0",
    "x-github-api-version": "2026-03-10"
  };
}

export async function pushRecordToFront(candidate: ArchiveRecord): Promise<void> {
  const localArchivePath = frontArchiveLocalPath();
  if (localArchivePath) {
    await pushRecordToLocalArchive(candidate, localArchivePath);
    return;
  }

  if (process.env.GITHUB_PUBLISH_DISABLED === "true") return;

  const repository = process.env.GITHUB_FRONT_REPOSITORY;
  const token = process.env.GITHUB_FRONT_TOKEN;
  const reference = process.env.GITHUB_FRONT_REF ?? "main";
  const contentPath = process.env.GITHUB_FRONT_CONTENT_PATH ?? "web/content/archive.json";
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository) || !token) {
    throw new Error("GITHUB_FRONT_REPOSITORY와 GITHUB_FRONT_TOKEN이 필요합니다.");
  }
  if (!contentPath || contentPath.startsWith("/") || contentPath.includes("..")) {
    throw new Error("GITHUB_FRONT_CONTENT_PATH는 저장소 내부의 안전한 상대 경로여야 합니다.");
  }

  const encodedPath = contentPath.split("/").map(encodeURIComponent).join("/");
  const endpoint = `https://api.github.com/repos/${repository}/contents/${encodedPath}`;
  const headers = githubHeaders(token);
  const currentResponse = await fetch(`${endpoint}?ref=${encodeURIComponent(reference)}`, {
    headers,
    signal: AbortSignal.timeout(20_000)
  });

  let current: FrontArchive = { version: 1, items: [] };
  let sha: string | undefined;
  if (currentResponse.ok) {
    const file = await currentResponse.json() as { type?: string; encoding?: string; content?: string; sha?: string };
    if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string" || typeof file.sha !== "string") {
      throw new Error(`GitHub의 ${contentPath} 응답 형식이 올바르지 않습니다.`);
    }
    const parsed = JSON.parse(Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf-8")) as Partial<FrontArchive>;
    if (!Array.isArray(parsed.items) || !parsed.items.every(isArchiveRecord)) {
      throw new Error(`front의 ${contentPath} 기록 형식이 올바르지 않습니다.`);
    }
    current = { version: 1, items: parsed.items };
    sha = file.sha;
  } else if (currentResponse.status !== 404) {
    throw new Error(`GitHub content read failed: ${currentResponse.status} ${await currentResponse.text()}`);
  }

  const merged = mergeArchiveRecords(current.items, candidate);
  if (merged === current.items) return;

  const content = Buffer.from(`${JSON.stringify({ version: 1, items: merged }, null, 2)}\n`, "utf-8").toString("base64");
  const body: Record<string, unknown> = {
    message: `archive: publish ${candidate.id}`,
    content,
    branch: reference
  };
  if (sha) body.sha = sha;

  const updateResponse = await fetch(endpoint, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  if (!updateResponse.ok) {
    throw new Error(`GitHub content update failed: ${updateResponse.status} ${await updateResponse.text()}`);
  }
}

export async function publishNextRecord(now = Date.now()): Promise<{ published: boolean; topicId?: string; processingWaitMs?: number }> {
  let records: ArchiveRecord[] = [];
  try {
    const payload = await readJson<{ items?: ArchiveRecord[] }>(join(dataRoot(), "informationized", "records.json"));
    records = Array.isArray(payload.items) ? payload.items : [];
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const state = await loadPublicationState();
  const minQuality = publicationMinQualityScore();
  const unpublished = records.filter((record) => !state.publishedTopicIds.includes(record.id));
  const candidate = state.pendingTopicId
    ? records.find((record) => record.id === state.pendingTopicId)
    : unpublished.find((record) => (record.qualityScore ?? 1) >= minQuality);
  if (!candidate) return { published: false };
  if (!isReadyForPublication(candidate, now)) {
    const collectedAt = candidate.collectedAt ? Date.parse(candidate.collectedAt) : now;
    return { published: false, topicId: candidate.id, processingWaitMs: Math.max(0, processingDelayMs() - (now - collectedAt)) };
  }

  state.pendingTopicId = candidate.id;
  await writeJson(publicationStatePath(), state);
  await pushRecordToFront(candidate);

  state.publishedTopicIds.push(candidate.id);
  state.publishedTopicIds = [...new Set(state.publishedTopicIds)];
  delete state.pendingTopicId;
  state.lastPublishedAt = new Date().toISOString();
  await writeJson(publicationStatePath(), state);
  return { published: true, topicId: candidate.id };
}
