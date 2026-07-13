export type SourceDefinition = {
  id?: string;
  topicId?: string;
  kind?: "file" | "inline" | "url" | "api-json";
  title?: string;
  period?: string;
  region?: string;
  url?: string;
  path?: string;
  content?: string;
  requiredEnv?: string;
  api?: {
    itemPath: string;
    idPath?: string;
    titlePath?: string;
    contentPaths: string[];
    urlPath?: string;
    maxItems?: number;
  };
  compliance?: {
    reviewedAt: string;
    crawlAllowed: boolean;
    termsUrl: string;
    copyrightUrl: string;
    minIntervalMs: number;
    notes?: string;
  };
};

export type RawDocument = {
  id: string;
  topicId: string;
  title: string;
  period: string;
  region: string;
  sourceUrl: string;
  content: string;
  contentHash?: string;
  previousContentHash?: string;
  changeKind?: "new" | "unchanged" | "updated";
  changeSummary?: {
    mode: "full" | "added-fragments";
    addedFragments: string[];
    previousLength: number;
    nextLength: number;
  };
  collectedAt: string;
  updatedAt?: string;
  labels?: string[];
  reliability?: "high" | "medium" | "needs-review";
  sourceReliabilityScore?: number;
  relevanceScore?: number;
  contextGroup?: string;
  labelingVersion?: string;
  eventClusterId?: string;
  eventClusterTitle?: string;
  eventClusterConfidence?: number;
  eventClusterReason?: string;
  sentenceIds?: string[];
  outlier?: boolean;
  outlierScore?: number;
  outlierReasons?: string[];
  qualityScore?: number;
  qualityDecision?: "accepted" | "review" | "rejected";
};

export type EventCluster = {
  id: string;
  title: string;
  documentIds: string[];
  sentenceIds: string[];
  labels: string[];
  representativeTerms: string[];
  confidence: number;
  entityResolution: {
    method: "rag-vector-registry";
    matchedExisting: boolean;
    score: number;
  };
  algorithm: {
    sentenceVectorModel: string;
    firstPass: "dbscan";
    secondPass: "hdbscan";
    anomalyDetection: "isolation-forest";
    finalPass: "kmeans";
  };
  updatedAt: string;
};

export type TopicDefinition = {
  id: string;
  title: string;
  period: string;
  region: string;
  sources: SourceDefinition[];
};
