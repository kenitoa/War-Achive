import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
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
  documentIds?: string[];
  sentenceIds?: string[];
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

type ArchiveChange = {
  addedDocumentIds: string[];
  removedDocumentIds: string[];
  addedSourceUrls: string[];
  removedSourceUrls: string[];
};

type PublicationHistoryEntry = {
  id: string;
  recordId: string;
  createdAt: string;
  rolledBackAt?: string;
  mode: "local" | "github";
  repository?: string;
  branch?: string;
  contentPath?: string;
  previousArchive: FrontArchive;
  nextArchive: FrontArchive;
  previousRecord?: ArchiveRecord;
  nextRecord: ArchiveRecord;
  change: ArchiveChange;
  commitSha?: string;
  rollbackCommitSha?: string;
};

type PublicationHistory = {
  version: 1;
  entries: PublicationHistoryEntry[];
};

export type PublicationState = {
  version: 1;
  publishedTopicIds: string[];
  publishedRecordFingerprints?: Record<string, string>;
  pendingTopicId?: string;
  lastAttemptedAt?: string;
  lastPublishedAt?: string;
  lastError?: string;
};

const emptyState = (): PublicationState => ({ version: 1, publishedTopicIds: [] });

export function publicationStatePath(): string {
  return join(dataRoot(), "state", "publication.json");
}

export function publicationHistoryPath(): string {
  return join(dataRoot(), "state", "publication-history.json");
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
  const index = existing.findIndex((record) => record.id === candidate.id);
  if (index >= 0) {
    if (JSON.stringify(existing[index]) === JSON.stringify(candidate)) return existing;
    const updated = [...existing];
    updated[index] = candidate;
    return updated;
  }
  return [...existing, candidate];
}

function recordFingerprint(record: ArchiveRecord): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex").slice(0, 16);
}

function archiveFingerprint(archive: FrontArchive): string {
  return createHash("sha256").update(JSON.stringify(archive)).digest("hex").slice(0, 16);
}

function diffList(previous: string[] | undefined, next: string[] | undefined): { added: string[]; removed: string[] } {
  const previousSet = new Set(previous ?? []);
  const nextSet = new Set(next ?? []);
  return {
    added: [...nextSet].filter((item) => !previousSet.has(item)),
    removed: [...previousSet].filter((item) => !nextSet.has(item))
  };
}

function archiveChange(previousRecord: ArchiveRecord | undefined, nextRecord: ArchiveRecord): ArchiveChange {
  const documentIds = diffList(previousRecord?.documentIds, nextRecord.documentIds);
  const sourceUrls = diffList(previousRecord?.sourceUrls ?? (previousRecord?.sourceUrl ? [previousRecord.sourceUrl] : []), nextRecord.sourceUrls ?? (nextRecord.sourceUrl ? [nextRecord.sourceUrl] : []));
  return {
    addedDocumentIds: documentIds.added,
    removedDocumentIds: documentIds.removed,
    addedSourceUrls: sourceUrls.added,
    removedSourceUrls: sourceUrls.removed
  };
}

async function loadPublicationHistory(): Promise<PublicationHistory> {
  try {
    const history = await readJson<PublicationHistory>(publicationHistoryPath());
    return { version: 1, entries: Array.isArray(history.entries) ? history.entries : [] };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, entries: [] };
    throw error;
  }
}

async function appendPublicationHistory(entry: PublicationHistoryEntry): Promise<void> {
  const history = await loadPublicationHistory();
  history.entries.push(entry);
  await writeJson(publicationHistoryPath(), history);
}

async function updatePublicationHistory(entry: PublicationHistoryEntry): Promise<void> {
  const history = await loadPublicationHistory();
  const index = history.entries.findIndex((item) => item.id === entry.id);
  if (index >= 0) history.entries[index] = entry;
  else history.entries.push(entry);
  await writeJson(publicationHistoryPath(), history);
}

function createHistoryEntry(args: {
  mode: "local" | "github";
  candidate: ArchiveRecord;
  previousArchive: FrontArchive;
  nextArchive: FrontArchive;
  repository?: string;
  branch?: string;
  contentPath?: string;
}): PublicationHistoryEntry {
  const previousRecord = args.previousArchive.items.find((record) => record.id === args.candidate.id);
  const createdAt = new Date().toISOString();
  return {
    id: `${createdAt.replace(/[:.]/g, "-")}-${args.candidate.id}`,
    recordId: args.candidate.id,
    createdAt,
    mode: args.mode,
    repository: args.repository,
    branch: args.branch,
    contentPath: args.contentPath,
    previousArchive: args.previousArchive,
    nextArchive: args.nextArchive,
    previousRecord,
    nextRecord: args.candidate,
    change: archiveChange(previousRecord, args.candidate)
  };
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
  const nextArchive: FrontArchive = { version: 1, items: merged };
  const historyEntry = createHistoryEntry({ mode: "local", candidate, previousArchive: current, nextArchive });
  await writeJson(archivePath, nextArchive);
  try {
    const written = await readJson<FrontArchive>(archivePath);
    if (archiveFingerprint(written) !== archiveFingerprint(nextArchive)) throw new Error("local archive write verification failed.");
    await appendPublicationHistory(historyEntry);
  } catch (error) {
    await writeJson(archivePath, current);
    throw error;
  }
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
  const nextArchive: FrontArchive = { version: 1, items: merged };
  const historyEntry = createHistoryEntry({
    mode: "github",
    candidate,
    previousArchive: current,
    nextArchive,
    repository,
    branch: reference,
    contentPath
  });

  const content = Buffer.from(`${JSON.stringify(nextArchive, null, 2)}\n`, "utf-8").toString("base64");
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
  const updatePayload = await updateResponse.json().catch(() => ({})) as { commit?: { sha?: string } };
  historyEntry.commitSha = updatePayload.commit?.sha;

  const verifyResponse = await fetch(`${endpoint}?ref=${encodeURIComponent(reference)}`, {
    headers,
    signal: AbortSignal.timeout(20_000)
  });
  if (!verifyResponse.ok) {
    await restoreGitHubArchive({ endpoint, headers, reference, archive: current, message: `archive: rollback ${candidate.id} verify-read-failed` });
    throw new Error(`GitHub content verification read failed: ${verifyResponse.status} ${await verifyResponse.text()}`);
  }
  const verifyFile = await verifyResponse.json() as { encoding?: string; content?: string };
  const verified = JSON.parse(Buffer.from(String(verifyFile.content ?? "").replace(/\s/g, ""), "base64").toString("utf-8")) as FrontArchive;
  if (archiveFingerprint(verified) !== archiveFingerprint(nextArchive)) {
    await restoreGitHubArchive({ endpoint, headers, reference, archive: current, message: `archive: rollback ${candidate.id} verify-mismatch` });
    throw new Error("GitHub content verification failed after publish.");
  }
  await appendPublicationHistory(historyEntry);
}

async function restoreGitHubArchive(args: {
  endpoint: string;
  headers: Record<string, string>;
  reference: string;
  archive: FrontArchive;
  message: string;
}): Promise<string | undefined> {
  const currentResponse = await fetch(`${args.endpoint}?ref=${encodeURIComponent(args.reference)}`, {
    headers: args.headers,
    signal: AbortSignal.timeout(20_000)
  });
  let sha: string | undefined;
  if (currentResponse.ok) {
    const currentFile = await currentResponse.json() as { sha?: string };
    sha = currentFile.sha;
  }
  const body: Record<string, unknown> = {
    message: args.message,
    content: Buffer.from(`${JSON.stringify(args.archive, null, 2)}\n`, "utf-8").toString("base64"),
    branch: args.reference
  };
  if (sha) body.sha = sha;
  const response = await fetch(args.endpoint, {
    method: "PUT",
    headers: args.headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`GitHub rollback update failed: ${response.status} ${await response.text()}`);
  const payload = await response.json().catch(() => ({})) as { commit?: { sha?: string } };
  return payload.commit?.sha;
}

export async function rollbackLastPublication(entryId?: string): Promise<{ rolledBack: boolean; entryId?: string; recordId?: string }> {
  const history = await loadPublicationHistory();
  const entry = [...history.entries].reverse().find((item) => !item.rolledBackAt && (!entryId || item.id === entryId));
  if (!entry) return { rolledBack: false };

  if (entry.mode === "local") {
    const archivePath = frontArchiveLocalPath();
    if (!archivePath) throw new Error("WAR_ARCHIVE_FRONT_ARCHIVE_PATH가 필요합니다.");
    await writeJson(archivePath, entry.previousArchive);
  } else {
    const repository = entry.repository ?? process.env.GITHUB_FRONT_REPOSITORY;
    const token = process.env.GITHUB_FRONT_TOKEN;
    const reference = entry.branch ?? process.env.GITHUB_FRONT_REF ?? "main";
    const contentPath = entry.contentPath ?? process.env.GITHUB_FRONT_CONTENT_PATH ?? "web/content/archive.json";
    if (!repository || !token) throw new Error("GitHub rollback에는 GITHUB_FRONT_REPOSITORY와 GITHUB_FRONT_TOKEN이 필요합니다.");
    const encodedPath = contentPath.split("/").map(encodeURIComponent).join("/");
    const endpoint = `https://api.github.com/repos/${repository}/contents/${encodedPath}`;
    entry.rollbackCommitSha = await restoreGitHubArchive({
      endpoint,
      headers: githubHeaders(token),
      reference,
      archive: entry.previousArchive,
      message: `archive: rollback ${entry.recordId}`
    });
  }

  entry.rolledBackAt = new Date().toISOString();
  await updatePublicationHistory(entry);
  return { rolledBack: true, entryId: entry.id, recordId: entry.recordId };
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
  state.publishedRecordFingerprints ??= {};
  const minQuality = publicationMinQualityScore();
  const unpublished = records.filter((record) => {
    if (!state.publishedTopicIds.includes(record.id)) return true;
    return state.publishedRecordFingerprints?.[record.id] !== recordFingerprint(record);
  });
  const candidate = state.pendingTopicId
    ? records.find((record) => record.id === state.pendingTopicId)
    : unpublished.find((record) => (record.qualityScore ?? 1) >= minQuality);
  if (!candidate) return { published: false };
  if (!isReadyForPublication(candidate, now)) {
    const collectedAt = candidate.collectedAt ? Date.parse(candidate.collectedAt) : now;
    return { published: false, topicId: candidate.id, processingWaitMs: Math.max(0, processingDelayMs() - (now - collectedAt)) };
  }

  state.pendingTopicId = candidate.id;
  state.lastAttemptedAt = new Date().toISOString();
  await writeJson(publicationStatePath(), state);
  await pushRecordToFront(candidate);

  state.publishedTopicIds.push(candidate.id);
  state.publishedTopicIds = [...new Set(state.publishedTopicIds)];
  state.publishedRecordFingerprints[candidate.id] = recordFingerprint(candidate);
  delete state.pendingTopicId;
  delete state.lastError;
  state.lastPublishedAt = new Date().toISOString();
  await writeJson(publicationStatePath(), state);
  return { published: true, topicId: candidate.id };
}
