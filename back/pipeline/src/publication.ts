import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
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
type PublicationMode = "disabled" | "local" | "github";
type PublishedArchiveIndex = {
  version: 1;
  updatedAt: string;
  items: Array<{
    id: string;
    path: string;
    title: string;
    fingerprint: string;
    updatedAt: string;
  }>;
};

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

export function publishedArchivePath(): string {
  return join(dataRoot(), "published", "archive.json");
}

export function publishedArchiveDirPath(): string {
  return join(dataRoot(), "published", "archive");
}

export function publishedArchiveIndexPath(): string {
  return join(publishedArchiveDirPath(), "index.json");
}

export function publishedArchiveRecordPath(recordId: string): string {
  return join(publishedArchiveDirPath(), `${recordId}.json`);
}

export function frontArchiveLocalPath(): string | undefined {
  return process.env.WAR_ARCHIVE_FRONT_ARCHIVE_PATH;
}

export function frontArchiveLocalDirPath(): string | undefined {
  return process.env.WAR_ARCHIVE_FRONT_ARCHIVE_DIR;
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

function archiveRecordFileName(recordId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(recordId)) throw new Error(`archive record id is not safe for a file path: ${recordId}`);
  return `${recordId}.json`;
}

function archiveRecordRelativePath(recordId: string): string {
  return archiveRecordFileName(recordId);
}

function archiveDirectoryPath(): string {
  const configured = process.env.GITHUB_FRONT_ARCHIVE_DIR
    ?? (process.env.GITHUB_FRONT_CONTENT_PATH && !process.env.GITHUB_FRONT_CONTENT_PATH.endsWith(".json")
      ? process.env.GITHUB_FRONT_CONTENT_PATH
      : undefined)
    ?? "web/content/archive";
  if (!configured || configured.startsWith("/") || configured.includes("..")) {
    throw new Error("GITHUB_FRONT_ARCHIVE_DIR는 저장소 내부의 안전한 상대 경로여야 합니다.");
  }
  return configured.replace(/\/+$/g, "");
}

function archiveIndexContent(archive: FrontArchive, updatedAt = new Date().toISOString()): PublishedArchiveIndex {
  return {
    version: 1,
    updatedAt,
    items: archive.items.map((record) => ({
      id: record.id,
      path: archiveRecordRelativePath(record.id),
      title: record.title,
      fingerprint: recordFingerprint(record),
      updatedAt
    }))
  };
}

function maybeArchiveRecord(value: unknown): ArchiveRecord | undefined {
  if (isArchiveRecord(value)) return value;
  if (value && typeof value === "object" && isArchiveRecord((value as { record?: unknown }).record)) return (value as { record: ArchiveRecord }).record;
  return undefined;
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

async function persistPublishedArchive(archive: FrontArchive): Promise<void> {
  const updatedAt = new Date().toISOString();
  await writeJson(publishedArchiveIndexPath(), archiveIndexContent(archive, updatedAt));
  for (const record of archive.items) await writeJson(publishedArchiveRecordPath(record.id), record);
}

async function loadPublishedArchiveSnapshot(): Promise<FrontArchive | undefined> {
  try {
    const index = await readJson<Partial<PublishedArchiveIndex>>(publishedArchiveIndexPath());
    if (Array.isArray(index.items)) {
      const items: ArchiveRecord[] = [];
      for (const entry of index.items) {
        if (!entry || typeof entry.id !== "string") continue;
        const record = maybeArchiveRecord(await readJson<unknown>(publishedArchiveRecordPath(entry.id)));
        if (record) items.push(record);
      }
      if (items.length > 0) return { version: 1, items };
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  try {
    const files = await readdir(publishedArchiveDirPath());
    const items: ArchiveRecord[] = [];
    for (const file of files.filter((item) => item.endsWith(".json") && item !== "index.json")) {
      const id = file.replace(/\.json$/i, "");
      const record = maybeArchiveRecord(await readJson<unknown>(publishedArchiveRecordPath(id)));
      if (record) items.push(record);
    }
    if (items.length > 0) return { version: 1, items };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  try {
    const snapshot = await readJson<Partial<FrontArchive>>(publishedArchivePath());
    if (Array.isArray(snapshot.items) && snapshot.items.every(isArchiveRecord)) return { version: 1, items: snapshot.items };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return undefined;
}

async function loadVerifiedPublishedArchive(): Promise<FrontArchive | undefined> {
  const localArchiveDir = frontArchiveLocalDirPath();
  if (localArchiveDir) {
    const archive = await loadLocalArchiveDirectory(localArchiveDir);
    await persistPublishedArchive(archive);
    return archive;
  }

  const localArchivePath = frontArchiveLocalPath();
  if (localArchivePath) {
    try {
      const localArchive = await readJson<Partial<FrontArchive>>(localArchivePath);
      if (Array.isArray(localArchive.items) && localArchive.items.every(isArchiveRecord)) return { version: 1, items: localArchive.items };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const repository = process.env.GITHUB_FRONT_REPOSITORY;
  const token = process.env.GITHUB_FRONT_TOKEN;
  if (process.env.GITHUB_PUBLISH_DISABLED !== "true" && repository && /^[^/]+\/[^/]+$/.test(repository) && token) {
    const reference = process.env.GITHUB_FRONT_REF ?? "main";
    const verified = await loadGitHubArchiveDirectory({ repository, token, reference, directory: archiveDirectoryPath() });
    await persistPublishedArchive(verified);
    return verified;
  }

  const snapshot = await loadPublishedArchiveSnapshot();
  if (snapshot) return snapshot;
  const history = await loadPublicationHistory();
  const entry = [...history.entries].reverse().find((item) => !item.rolledBackAt && item.nextArchive?.items?.every(isArchiveRecord));
  return entry?.nextArchive;
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

async function pushRecordToLocalArchive(candidate: ArchiveRecord, archivePath: string): Promise<PublicationMode> {
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
  if (merged === current.items) {
    await persistPublishedArchive(current);
    return "local";
  }
  const nextArchive: FrontArchive = { version: 1, items: merged };
  const historyEntry = createHistoryEntry({ mode: "local", candidate, previousArchive: current, nextArchive });
  await writeJson(archivePath, nextArchive);
  try {
    const written = await readJson<FrontArchive>(archivePath);
    if (archiveFingerprint(written) !== archiveFingerprint(nextArchive)) throw new Error("local archive write verification failed.");
    await persistPublishedArchive(nextArchive);
    await appendPublicationHistory(historyEntry);
    return "local";
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

async function githubRequestError(operation: string, response: Response, repository?: string): Promise<Error> {
  const text = await response.text();
  const target = repository ? ` for ${repository}` : "";
  const hint = githubFailureHint(response.status, text, repository);
  return new Error(`${operation} failed${target}: ${response.status} ${text}${hint}`);
}

function githubFailureHint(status: number, text: string, repository?: string): string {
  if (status === 401) {
    return " Hint: GITHUB_FRONT_TOKEN is not accepted by GitHub. Replace the token in back/.env, then rebuild/recreate the running container so it uses the new value.";
  }
  if (status === 403 && /Resource not accessible by personal access token/i.test(text)) {
    const target = repository ?? "the front repository";
    return ` Hint: GITHUB_FRONT_TOKEN is authenticated but cannot write ${target}. Give the token Contents read/write permission and include the repository in Repository access.`;
  }
  return "";
}

function githubContentsEndpoint(repository: string, path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${repository}/contents/${encodedPath}`;
}

async function readGitHubJsonFile<T>(args: {
  repository: string;
  token: string;
  reference: string;
  path: string;
}): Promise<{ content: T; sha?: string } | undefined> {
  const endpoint = githubContentsEndpoint(args.repository, args.path);
  const response = await fetch(`${endpoint}?ref=${encodeURIComponent(args.reference)}`, {
    headers: githubHeaders(args.token),
    signal: AbortSignal.timeout(20_000)
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw await githubRequestError("GitHub content read", response, args.repository);
  const file = await response.json() as { type?: string; encoding?: string; content?: string; sha?: string };
  if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string") {
    throw new Error(`GitHub의 ${args.path} 응답 형식이 올바르지 않습니다.`);
  }
  return {
    content: JSON.parse(Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf-8")) as T,
    sha: file.sha
  };
}

async function loadGitHubArchiveDirectory(args: {
  repository: string;
  token: string;
  reference: string;
  directory: string;
}): Promise<FrontArchive> {
  const endpoint = githubContentsEndpoint(args.repository, args.directory);
  const response = await fetch(`${endpoint}?ref=${encodeURIComponent(args.reference)}`, {
    headers: githubHeaders(args.token),
    signal: AbortSignal.timeout(20_000)
  });
  if (response.status === 404) return { version: 1, items: [] };
  if (!response.ok) throw await githubRequestError("GitHub published archive directory read", response, args.repository);
  const listing = await response.json() as Array<{ type?: string; name?: string; path?: string }>;
  if (!Array.isArray(listing)) throw new Error(`GitHub의 ${args.directory} 응답 형식이 올바르지 않습니다.`);

  const items: ArchiveRecord[] = [];
  for (const entry of listing.filter((item) => item.type === "file" && item.name?.endsWith(".json") && item.name !== "index.json")) {
    if (!entry.path) continue;
    const payload = await readGitHubJsonFile<unknown>({ ...args, path: entry.path });
    const record = payload ? maybeArchiveRecord(payload.content) : undefined;
    if (record) items.push(record);
  }
  return { version: 1, items };
}

async function loadLocalArchiveDirectory(directory: string): Promise<FrontArchive> {
  try {
    const files = await readdir(directory);
    const items: ArchiveRecord[] = [];
    for (const file of files.filter((item) => item.endsWith(".json") && item !== "index.json")) {
      const id = file.replace(/\.json$/i, "");
      const record = maybeArchiveRecord(await readJson<unknown>(join(directory, archiveRecordFileName(id))));
      if (record) items.push(record);
    }
    return { version: 1, items };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, items: [] };
    throw error;
  }
}

async function writeLocalArchiveDirectory(directory: string, archive: FrontArchive, candidate: ArchiveRecord): Promise<void> {
  await writeJson(join(directory, archiveRecordFileName(candidate.id)), candidate);
  await writeJson(join(directory, "index.json"), archiveIndexContent(archive));
}

async function pushRecordToLocalArchiveDirectory(candidate: ArchiveRecord, directory: string): Promise<PublicationMode> {
  const current = await loadLocalArchiveDirectory(directory);
  const merged = mergeArchiveRecords(current.items, candidate);
  if (merged === current.items) {
    await persistPublishedArchive(current);
    return "local";
  }
  const nextArchive: FrontArchive = { version: 1, items: merged };
  const historyEntry = createHistoryEntry({ mode: "local", candidate, previousArchive: current, nextArchive, contentPath: `${directory}/${archiveRecordFileName(candidate.id)}` });
  await writeLocalArchiveDirectory(directory, nextArchive, candidate);
  await persistPublishedArchive(nextArchive);
  await appendPublicationHistory(historyEntry);
  return "local";
}

async function putGitHubJsonFile(args: {
  repository: string;
  token: string;
  reference: string;
  path: string;
  payload: unknown;
  message: string;
  sha?: string;
}): Promise<string | undefined> {
  const endpoint = githubContentsEndpoint(args.repository, args.path);
  const body: Record<string, unknown> = {
    message: args.message,
    content: Buffer.from(`${JSON.stringify(args.payload, null, 2)}\n`, "utf-8").toString("base64"),
    branch: args.reference
  };
  if (args.sha) body.sha = args.sha;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: githubHeaders(args.token),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw await githubRequestError("GitHub content update", response, args.repository);
  const updatePayload = await response.json().catch(() => ({})) as { commit?: { sha?: string } };
  return updatePayload.commit?.sha;
}

async function deleteGitHubFileIfExists(args: {
  repository: string;
  token: string;
  reference: string;
  path: string;
  message: string;
}): Promise<string | undefined> {
  const current = await readGitHubJsonFile<unknown>(args);
  if (!current?.sha) return undefined;
  const response = await fetch(githubContentsEndpoint(args.repository, args.path), {
    method: "DELETE",
    headers: githubHeaders(args.token),
    body: JSON.stringify({ message: args.message, sha: current.sha, branch: args.reference }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw await githubRequestError("GitHub content delete", response, args.repository);
  const payload = await response.json().catch(() => ({})) as { commit?: { sha?: string } };
  return payload.commit?.sha;
}

export async function pushRecordToFront(candidate: ArchiveRecord): Promise<PublicationMode> {
  const localArchiveDir = frontArchiveLocalDirPath();
  if (localArchiveDir) {
    return pushRecordToLocalArchiveDirectory(candidate, localArchiveDir);
  }

  const localArchivePath = frontArchiveLocalPath();
  if (localArchivePath) {
    return pushRecordToLocalArchive(candidate, localArchivePath);
  }

  if (process.env.GITHUB_PUBLISH_DISABLED === "true") return "disabled";

  const repository = process.env.GITHUB_FRONT_REPOSITORY;
  const token = process.env.GITHUB_FRONT_TOKEN;
  const reference = process.env.GITHUB_FRONT_REF ?? "main";
  const archiveDir = archiveDirectoryPath();
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository) || !token) {
    throw new Error("GITHUB_FRONT_REPOSITORY와 GITHUB_FRONT_TOKEN이 필요합니다.");
  }

  const recordPath = `${archiveDir}/${archiveRecordFileName(candidate.id)}`;
  const indexPath = `${archiveDir}/index.json`;
  const current = await loadGitHubArchiveDirectory({ repository, token, reference, directory: archiveDir });
  const currentRecordFile = await readGitHubJsonFile<unknown>({ repository, token, reference, path: recordPath });

  const merged = mergeArchiveRecords(current.items, candidate);
  if (merged === current.items) {
    await persistPublishedArchive(current);
    return "github";
  }
  const nextArchive: FrontArchive = { version: 1, items: merged };
  const historyEntry = createHistoryEntry({
    mode: "github",
    candidate,
    previousArchive: current,
    nextArchive,
    repository,
    branch: reference,
    contentPath: recordPath
  });

  historyEntry.commitSha = await putGitHubJsonFile({
    repository,
    token,
    reference,
    path: recordPath,
    payload: candidate,
    message: `archive: publish ${candidate.id}`,
    sha: currentRecordFile?.sha
  });
  await putGitHubJsonFile({
    repository,
    token,
    reference,
    path: indexPath,
    payload: archiveIndexContent(nextArchive),
    message: `archive: update index ${candidate.id}`,
    sha: (await readGitHubJsonFile<unknown>({ repository, token, reference, path: indexPath }))?.sha
  });

  const verifiedRecord = maybeArchiveRecord((await readGitHubJsonFile<unknown>({ repository, token, reference, path: recordPath }))?.content);
  if (!verifiedRecord || recordFingerprint(verifiedRecord) !== recordFingerprint(candidate)) {
    await restoreGitHubArchiveRecord({ repository, token, reference, archiveDir, candidate, previousRecord: historyEntry.previousRecord, nextArchive: current });
    throw new Error("GitHub content verification failed after publish.");
  }
  await persistPublishedArchive(nextArchive);
  await appendPublicationHistory(historyEntry);
  return "github";
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

async function restoreGitHubArchiveRecord(args: {
  repository: string;
  token: string;
  reference: string;
  archiveDir: string;
  candidate: ArchiveRecord;
  previousRecord?: ArchiveRecord;
  nextArchive: FrontArchive;
}): Promise<string | undefined> {
  const recordPath = `${args.archiveDir}/${archiveRecordFileName(args.candidate.id)}`;
  const indexPath = `${args.archiveDir}/index.json`;
  let commitSha: string | undefined;
  if (args.previousRecord) {
    const currentRecord = await readGitHubJsonFile<unknown>({
      repository: args.repository,
      token: args.token,
      reference: args.reference,
      path: recordPath
    });
    commitSha = await putGitHubJsonFile({
      repository: args.repository,
      token: args.token,
      reference: args.reference,
      path: recordPath,
      payload: args.previousRecord,
      message: `archive: rollback ${args.candidate.id}`,
      sha: currentRecord?.sha
    });
  } else {
    commitSha = await deleteGitHubFileIfExists({
      repository: args.repository,
      token: args.token,
      reference: args.reference,
      path: recordPath,
      message: `archive: delete ${args.candidate.id}`
    });
  }
  const currentIndex = await readGitHubJsonFile<unknown>({
    repository: args.repository,
    token: args.token,
    reference: args.reference,
    path: indexPath
  });
  await putGitHubJsonFile({
    repository: args.repository,
    token: args.token,
    reference: args.reference,
    path: indexPath,
    payload: archiveIndexContent(args.nextArchive),
    message: `archive: rollback index ${args.candidate.id}`,
    sha: currentIndex?.sha
  });
  return commitSha;
}

export async function rollbackLastPublication(entryId?: string): Promise<{ rolledBack: boolean; entryId?: string; recordId?: string }> {
  const history = await loadPublicationHistory();
  const entry = [...history.entries].reverse().find((item) => !item.rolledBackAt && (!entryId || item.id === entryId));
  if (!entry) return { rolledBack: false };

  if (entry.mode === "local") {
    const archiveDir = frontArchiveLocalDirPath();
    if (archiveDir) {
      const recordPath = join(archiveDir, archiveRecordFileName(entry.recordId));
      if (entry.previousRecord) await writeJson(recordPath, entry.previousRecord);
      else await rm(recordPath, { force: true });
      await writeJson(join(archiveDir, "index.json"), archiveIndexContent(entry.previousArchive));
    } else {
      const archivePath = frontArchiveLocalPath();
      if (!archivePath) throw new Error("WAR_ARCHIVE_FRONT_ARCHIVE_PATH가 필요합니다.");
      await writeJson(archivePath, entry.previousArchive);
    }
  } else {
    const repository = entry.repository ?? process.env.GITHUB_FRONT_REPOSITORY;
    const token = process.env.GITHUB_FRONT_TOKEN;
    const reference = entry.branch ?? process.env.GITHUB_FRONT_REF ?? "main";
    if (!repository || !token) throw new Error("GitHub rollback에는 GITHUB_FRONT_REPOSITORY와 GITHUB_FRONT_TOKEN이 필요합니다.");
    const contentPath = entry.contentPath;
    if (contentPath?.endsWith("archive.json")) {
      const endpoint = githubContentsEndpoint(repository, contentPath);
      entry.rollbackCommitSha = await restoreGitHubArchive({
        endpoint,
        headers: githubHeaders(token),
        reference,
        archive: entry.previousArchive,
        message: `archive: rollback ${entry.recordId}`
      });
    } else {
      const archiveDir = contentPath?.includes("/")
        ? contentPath.split("/").slice(0, -1).join("/")
        : archiveDirectoryPath();
      entry.rollbackCommitSha = await restoreGitHubArchiveRecord({
        repository,
        token,
        reference,
        archiveDir,
        candidate: entry.nextRecord,
        previousRecord: entry.previousRecord,
        nextArchive: entry.previousArchive
      });
    }
  }

  entry.rolledBackAt = new Date().toISOString();
  await persistPublishedArchive(entry.previousArchive);
  await updatePublicationHistory(entry);
  return { rolledBack: true, entryId: entry.id, recordId: entry.recordId };
}

export async function publishNextRecord(now = Date.now()): Promise<{ published: boolean; topicId?: string; processingWaitMs?: number; publicationDisabled?: boolean }> {
  let records: ArchiveRecord[] = [];
  try {
    const payload = await readJson<{ items?: ArchiveRecord[] }>(join(dataRoot(), "informationized", "records.json"));
    records = Array.isArray(payload.items) ? payload.items : [];
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const state = await loadPublicationState();
  state.publishedRecordFingerprints ??= {};
  state.lastAttemptedAt = new Date().toISOString();
  const minQuality = publicationMinQualityScore();
  let verifiedArchive: FrontArchive | undefined;
  try {
    verifiedArchive = await loadVerifiedPublishedArchive();
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    await writeJson(publicationStatePath(), state);
    throw error;
  }
  const verifiedFingerprints = new Map((verifiedArchive?.items ?? []).map((record) => [record.id, recordFingerprint(record)]));
  const unpublished = records.filter((record) => verifiedFingerprints.get(record.id) !== recordFingerprint(record));
  const candidate = state.pendingTopicId
    ? records.find((record) => record.id === state.pendingTopicId)
    : unpublished.find((record) => (record.qualityScore ?? 1) >= minQuality);
  if (!candidate) {
    const confirmedRecords = verifiedArchive?.items ?? [];
    state.publishedTopicIds = [...new Set(confirmedRecords.map((record) => record.id))];
    state.publishedRecordFingerprints = Object.fromEntries(confirmedRecords.map((record) => [record.id, recordFingerprint(record)]));
    if (state.pendingTopicId) {
      state.lastError = `Pending publication record no longer exists: ${state.pendingTopicId}`;
      delete state.pendingTopicId;
    } else {
      delete state.lastError;
    }
    await writeJson(publicationStatePath(), state);
    return { published: false };
  }
  if (!isReadyForPublication(candidate, now)) {
    const collectedAt = candidate.collectedAt ? Date.parse(candidate.collectedAt) : now;
    state.pendingTopicId = candidate.id;
    await writeJson(publicationStatePath(), state);
    return { published: false, topicId: candidate.id, processingWaitMs: Math.max(0, processingDelayMs() - (now - collectedAt)) };
  }

  state.pendingTopicId = candidate.id;
  await writeJson(publicationStatePath(), state);
  let mode: PublicationMode;
  try {
    mode = await pushRecordToFront(candidate);
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    await writeJson(publicationStatePath(), state);
    throw error;
  }
  if (mode === "disabled") {
    delete state.pendingTopicId;
    state.lastError = "GitHub publication is disabled; no public archive commit was created.";
    await writeJson(publicationStatePath(), state);
    return { published: false, topicId: candidate.id, publicationDisabled: true };
  }

  let confirmedArchive: FrontArchive | undefined;
  try {
    confirmedArchive = await loadVerifiedPublishedArchive();
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    await writeJson(publicationStatePath(), state);
    throw error;
  }
  const confirmedRecords = confirmedArchive?.items ?? [candidate];
  state.publishedTopicIds = [...new Set(confirmedRecords.map((record) => record.id))];
  state.publishedRecordFingerprints = Object.fromEntries(confirmedRecords.map((record) => [record.id, recordFingerprint(record)]));
  delete state.pendingTopicId;
  delete state.lastError;
  state.lastPublishedAt = new Date().toISOString();
  await writeJson(publicationStatePath(), state);
  return { published: true, topicId: candidate.id };
}
