export type SourceDefinition = {
  id?: string;
  topicId?: string;
  kind?: "inline" | "url";
  title?: string;
  period?: string;
  region?: string;
  url?: string;
  content?: string;
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
  collectedAt: string;
  labels?: string[];
  labelingVersion?: string;
};

export type TopicDefinition = {
  id: string;
  title: string;
  period: string;
  region: string;
  sources: SourceDefinition[];
};
