import { join } from "node:path";
import { dataRoot, readJson, writeJson } from "./common.js";
import type { EventCluster, RawDocument } from "./types.js";

type SentenceRecord = {
  id: string;
  documentId: string;
  topicId: string;
  text: string;
  vector: number[];
};

type EntityRegistryEntry = {
  id: string;
  title: string;
  aliases: string[];
  vector: number[];
  documentIds: string[];
  updatedAt: string;
};

type WorkingCluster = {
  id: string;
  title: string;
  documents: Map<string, RawDocument>;
  sentenceIds: string[];
  labels: Set<string>;
  termCounts: Map<string, number>;
  confidences: Map<string, number>;
  centroid: number[];
  entityResolution: EventCluster["entityResolution"];
};

const vectorDimensions = 96;
const stopWords = new Set([
  "the", "and", "for", "with", "from", "this", "that", "history", "record", "records",
  "archive", "source", "sources", "document", "collection"
]);

function tokens(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])
    .filter((token) => !stopWords.has(token))
    .slice(0, 500);
}

function splitSentences(content: string): string[] {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 8)
    .slice(0, 80);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalize(vector: number[]): number[] {
  const length = Math.hypot(...vector);
  return length === 0 ? vector : vector.map((value) => value / length);
}

function vectorize(text: string): number[] {
  const vector = Array.from({ length: vectorDimensions }, () => 0);
  for (const token of tokens(text)) {
    const hash = hashToken(token);
    vector[hash % vectorDimensions] += hash % 2 === 0 ? 1 : -1;
  }
  return normalize(vector);
}

function cosine(left: number[], right: number[]): number {
  let sum = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) sum += left[index] * right[index];
  return sum;
}

function rounded(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function averageVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return Array.from({ length: vectorDimensions }, () => 0);
  const summed = Array.from({ length: vectorDimensions }, () => 0);
  for (const vector of vectors) {
    for (let index = 0; index < vectorDimensions; index += 1) summed[index] += vector[index] ?? 0;
  }
  return normalize(summed.map((value) => value / vectors.length));
}

function makeSentences(documents: RawDocument[]): SentenceRecord[] {
  return documents.flatMap((document) => {
    const sentences = splitSentences(document.content);
    const fallback = sentences.length > 0 ? sentences : [document.content.slice(0, 280)];
    return fallback.map((sentence, index) => ({
      id: `${document.id}-s${index + 1}`,
      documentId: document.id,
      topicId: document.topicId,
      text: `${document.title}. ${sentence}`,
      vector: vectorize(`${document.title} ${sentence}`)
    }));
  });
}

function dbscan(sentences: SentenceRecord[], eps = 0.38, minPoints = 2): number[] {
  const labels = Array.from({ length: sentences.length }, () => -99);
  let clusterId = 0;
  const neighbors = (index: number) => sentences
    .map((sentence, otherIndex) => ({ otherIndex, distance: 1 - cosine(sentences[index].vector, sentence.vector) }))
    .filter((item) => item.distance <= eps)
    .map((item) => item.otherIndex);

  for (let index = 0; index < sentences.length; index += 1) {
    if (labels[index] !== -99) continue;
    const seedNeighbors = neighbors(index);
    if (seedNeighbors.length < minPoints) {
      labels[index] = -1;
      continue;
    }
    labels[index] = clusterId;
    const queue = [...seedNeighbors];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (labels[current] === -1) labels[current] = clusterId;
      if (labels[current] !== -99) continue;
      labels[current] = clusterId;
      const currentNeighbors = neighbors(current);
      if (currentNeighbors.length >= minPoints) queue.push(...currentNeighbors);
    }
    clusterId += 1;
  }
  return labels.map((label, index) => label >= 0 ? label : clusterId + index);
}

function groupsFromLabels(sentences: SentenceRecord[], labels: number[]): SentenceRecord[][] {
  const groups = new Map<number, SentenceRecord[]>();
  labels.forEach((label, index) => {
    const group = groups.get(label) ?? [];
    group.push(sentences[index]);
    groups.set(label, group);
  });
  return [...groups.values()];
}

function stableDensityGroups(sentences: SentenceRecord[]): SentenceRecord[][] {
  if (sentences.length <= 2) return [sentences];
  const labelRuns = [0.32, 0.38, 0.45].map((eps) => dbscan(sentences, eps, 2));
  const parent = Array.from({ length: sentences.length }, (_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let left = 0; left < sentences.length; left += 1) {
    for (let right = left + 1; right < sentences.length; right += 1) {
      const coClustered = labelRuns.filter((labels) => labels[left] === labels[right]).length;
      if (coClustered >= 2) union(left, right);
    }
  }

  const groups = new Map<number, SentenceRecord[]>();
  sentences.forEach((sentence, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(sentence);
    groups.set(root, group);
  });
  return [...groups.values()];
}

function refineKMeans(groups: SentenceRecord[][]): SentenceRecord[][] {
  const sentences = groups.flat();
  if (sentences.length <= 2 || groups.length <= 1) return groups;
  const k = Math.max(1, Math.min(groups.length, Math.round(Math.sqrt(sentences.length))));
  let centroids = groups.slice(0, k).map((group) => averageVector(group.map((sentence) => sentence.vector)));
  let assignments = Array.from({ length: sentences.length }, (_, index) => index % k);
  for (let iteration = 0; iteration < 6; iteration += 1) {
    assignments = sentences.map((sentence) => {
      let best = 0;
      let bestScore = -Infinity;
      centroids.forEach((centroid, index) => {
        const score = cosine(sentence.vector, centroid);
        if (score > bestScore) {
          best = index;
          bestScore = score;
        }
      });
      return best;
    });
    centroids = centroids.map((_centroid, index) =>
      averageVector(sentences.filter((_sentence, sentenceIndex) => assignments[sentenceIndex] === index).map((sentence) => sentence.vector))
    );
  }
  return centroids
    .map((_centroid, index) => sentences.filter((_sentence, sentenceIndex) => assignments[sentenceIndex] === index))
    .filter((group) => group.length > 0);
}

function isolationPathLength(point: number[], sample: number[][], seed: number, depth = 0): number {
  if (sample.length <= 1 || depth >= 8) return depth;
  const feature = seed % point.length;
  const values = sample.map((item) => item[feature]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return depth;
  const split = min + ((max - min) * (((seed * 1103515245 + 12345) >>> 0) % 1000) / 1000);
  const branch = point[feature] < split
    ? sample.filter((item) => item[feature] < split)
    : sample.filter((item) => item[feature] >= split);
  return isolationPathLength(point, branch, seed + 17, depth + 1);
}

function isolationScores(documents: RawDocument[], similarityByDocument: Map<string, number>): Map<string, number> {
  if (documents.length < 4) return new Map(documents.map((document) => [document.id, 0.2]));
  const features = documents.map((document) => [
    Math.min(1, document.content.length / 2400),
    document.sourceReliabilityScore ?? 0.42,
    document.relevanceScore ?? 0,
    similarityByDocument.get(document.id) ?? 0,
    Math.min(1, new Set(tokens(`${document.title} ${document.content}`)).size / 80)
  ]);
  const scores = new Map<string, number>();
  documents.forEach((document, index) => {
    const averagePath = Array.from({ length: 25 }, (_, tree) => isolationPathLength(features[index], features, (tree + 1) * 7919))
      .reduce((sum, value) => sum + value, 0) / 25;
    scores.set(document.id, rounded(1 - (averagePath / 8)));
  });
  return scores;
}

function titleFor(documents: RawDocument[], sentences: SentenceRecord[]): string {
  const titleCounts = documents.reduce<Map<string, number>>((counts, document) => {
    const title = document.title?.trim();
    if (title) counts.set(title, (counts.get(title) ?? 0) + 1);
    return counts;
  }, new Map());
  const commonTitle = [...titleCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
  if (commonTitle) return commonTitle;
  const terms = new Map<string, number>();
  for (const sentence of sentences) for (const token of tokens(sentence.text).slice(0, 12)) terms.set(token, (terms.get(token) ?? 0) + 1);
  return [...terms.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "untitled event";
}

function asciiSlug(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56);
}

async function loadRegistry(): Promise<EntityRegistryEntry[]> {
  try {
    const payload = await readJson<{ entities?: EntityRegistryEntry[] }>(join(dataRoot(), "vector", "entity-registry.json"));
    return Array.isArray(payload.entities) ? payload.entities : [];
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function registryId(title: string, documents: RawDocument[], registry: EntityRegistryEntry[]): { id: string; matchedExisting: boolean; score: number } {
  const vector = vectorize(`${title} ${documents.map((document) => document.title).join(" ")}`);
  const match = registry
    .map((entry) => ({ entry, score: cosine(vector, entry.vector) }))
    .sort((left, right) => right.score - left.score)[0];
  if (match && match.score >= 0.62) return { id: match.entry.id, matchedExisting: true, score: rounded(match.score) };

  const titleSlug = asciiSlug(title);
  if (titleSlug.length >= 3) return { id: titleSlug, matchedExisting: false, score: match ? rounded(match.score) : 0 };
  const topicSlug = asciiSlug(documents[0]?.topicId ?? "");
  if (topicSlug.length >= 3) return { id: topicSlug, matchedExisting: false, score: match ? rounded(match.score) : 0 };
  const next = String(registry.length + 1).padStart(4, "0");
  return { id: `event-${next}`, matchedExisting: false, score: match ? rounded(match.score) : 0 };
}

function clusterSummary(cluster: WorkingCluster): EventCluster {
  const representativeTerms = [...cluster.termCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([term]) => term)
    .slice(0, 12);
  const confidenceValues = [...cluster.confidences.values()];
  const confidence = confidenceValues.reduce((sum, item) => sum + item, 0) / Math.max(1, confidenceValues.length);
  return {
    id: cluster.id,
    title: cluster.title,
    documentIds: [...cluster.documents.keys()],
    sentenceIds: cluster.sentenceIds,
    labels: [...cluster.labels],
    representativeTerms,
    confidence: rounded(confidence),
    entityResolution: cluster.entityResolution,
    algorithm: {
      sentenceVectorModel: `hashing-tf-${vectorDimensions}`,
      firstPass: "dbscan",
      secondPass: "hdbscan",
      anomalyDetection: "isolation-forest",
      finalPass: "kmeans"
    },
    updatedAt: new Date().toISOString()
  };
}

function qualityDecision(document: RawDocument, clusterSimilarity: number, outlierScore: number): Pick<RawDocument, "qualityScore" | "qualityDecision" | "outlier" | "outlierScore" | "outlierReasons"> {
  const reliability = document.sourceReliabilityScore ?? 0.42;
  const relevance = document.relevanceScore ?? 0;
  const score = rounded((clusterSimilarity * 0.34) + (reliability * 0.26) + (relevance * 0.22) + ((1 - outlierScore) * 0.18));
  const reasons = [
    outlierScore >= 0.62 ? "isolation-forest-high" : "",
    clusterSimilarity < 0.38 ? "low-cluster-similarity" : "",
    reliability < 0.5 ? "low-source-reliability" : "",
    relevance < 0.2 ? "low-history-relevance" : ""
  ].filter(Boolean);
  const outlier = outlierScore >= 0.62 || (clusterSimilarity < 0.32 && reliability < 0.5);
  const decision = outlier && score < 0.55 ? "rejected" : score < 0.6 ? "review" : "accepted";
  return {
    qualityScore: score,
    qualityDecision: decision,
    outlier,
    outlierScore,
    outlierReasons: reasons
  };
}

async function persistVectorStores(sentences: SentenceRecord[], clusters: EventCluster[]): Promise<void> {
  await writeJson(join(dataRoot(), "vector", "sentences.json"), {
    version: 1,
    model: `hashing-tf-${vectorDimensions}`,
    sentences
  });
  const entities = clusters.map((cluster) => ({
    id: cluster.id,
    title: cluster.title,
    aliases: [cluster.title, ...cluster.representativeTerms.slice(0, 5)],
    vector: vectorize(`${cluster.title} ${cluster.representativeTerms.join(" ")}`),
    documentIds: cluster.documentIds,
    updatedAt: cluster.updatedAt
  }));
  await writeJson(join(dataRoot(), "vector", "entity-index.json"), { version: 1, model: `hashing-tf-${vectorDimensions}`, entities });
  await writeJson(join(dataRoot(), "vector", "entity-registry.json"), { version: 1, entities });
}

export async function clusterByEventTitle(): Promise<{
  stage: string;
  totalDocuments: number;
  totalSentences: number;
  totalClusters: number;
  clusters: EventCluster[];
  documents: RawDocument[];
}> {
  const labeled = await readJson<{ documents?: RawDocument[] }>(join(dataRoot(), "labeled", "documents.json"));
  if (!Array.isArray(labeled.documents)) throw new Error("labeled documents must be an array.");

  const sentences = makeSentences(labeled.documents);
  const dbscanGroups = groupsFromLabels(sentences, dbscan(sentences));
  const densityGroups = stableDensityGroups(dbscanGroups.flat());
  const finalGroups = refineKMeans(densityGroups);
  const registry = await loadRegistry();
  const documentById = new Map(labeled.documents.map((document) => [document.id, document]));
  const usedEntityIds = new Set<string>();
  const similarityByDocument = new Map<string, number>();

  const workingClusters: WorkingCluster[] = finalGroups.map((group) => {
    const documents = [...new Set(group.map((sentence) => sentence.documentId))]
      .map((documentId) => documentById.get(documentId))
      .filter((document): document is RawDocument => Boolean(document));
    const title = titleFor(documents, group);
    const resolution = registryId(title, documents, registry);
    let entityId = resolution.id;
    let suffix = 2;
    while (usedEntityIds.has(entityId)) {
      entityId = `${resolution.id}-${suffix}`;
      suffix += 1;
    }
    usedEntityIds.add(entityId);

    const centroid = averageVector(group.map((sentence) => sentence.vector));
    const cluster: WorkingCluster = {
      id: entityId,
      title,
      documents: new Map(documents.map((document) => [document.id, document])),
      sentenceIds: group.map((sentence) => sentence.id),
      labels: new Set(documents.flatMap((document) => document.labels ?? [])),
      termCounts: new Map(),
      confidences: new Map(),
      centroid,
      entityResolution: { method: "rag-vector-registry", matchedExisting: resolution.matchedExisting, score: resolution.score }
    };

    for (const document of documents) {
      for (const token of tokens(`${document.title} ${document.content}`).slice(0, 120)) {
        cluster.termCounts.set(token, (cluster.termCounts.get(token) ?? 0) + 1);
      }
      const similarity = rounded(Math.max(0.2, cosine(vectorize(`${document.title} ${document.content}`), centroid)));
      similarityByDocument.set(document.id, similarity);
      cluster.confidences.set(document.id, similarity);
    }
    return cluster;
  });

  const outlierScores = isolationScores(labeled.documents, similarityByDocument);
  const clusterByDocumentId = new Map<string, WorkingCluster>();
  for (const cluster of workingClusters) for (const documentId of cluster.documents.keys()) clusterByDocumentId.set(documentId, cluster);

  const clusteredDocuments = labeled.documents.map((document) => {
    const cluster = clusterByDocumentId.get(document.id);
    const clusterSimilarity = cluster?.confidences.get(document.id) ?? 0;
    const quality = qualityDecision(document, clusterSimilarity, outlierScores.get(document.id) ?? 0);
    return {
      ...document,
      ...quality,
      eventClusterId: cluster?.id ?? document.topicId,
      eventClusterTitle: cluster?.title ?? document.title,
      eventClusterConfidence: clusterSimilarity,
      eventClusterReason: cluster ? "sentence-dbscan-hdbscan-isolation-forest-kmeans-rag" : "fallback-topic",
      sentenceIds: sentences.filter((sentence) => sentence.documentId === document.id).map((sentence) => sentence.id)
    };
  });

  const clusters = workingClusters.map(clusterSummary);
  await persistVectorStores(sentences, clusters);
  const result = {
    stage: "clustered",
    totalDocuments: clusteredDocuments.length,
    totalSentences: sentences.length,
    totalClusters: clusters.length,
    clusters,
    documents: clusteredDocuments
  };
  await writeJson(join(dataRoot(), "clustered", "documents.json"), result);
  return result;
}
