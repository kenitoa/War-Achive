import { z } from 'zod';
import { PublicRecordSchema } from './contracts.js';
import type { PublicRecord } from './contracts.js';

export const SourcePolicySchema = z.object({
  status: z.enum(['unreviewed', 'approved']).default('unreviewed'),
  allowAutoPublish: z.boolean().default(false), metadataOnly: z.literal(true).default(true),
  rightsLabel: z.string().min(1).max(500).default('원 소장처에서 자료별 이용 조건을 확인하세요.'),
  rightsUrl: z.url().refine((v) => /^https?:\/\//.test(v)).optional(),
  reviewedBy: z.string().optional(), reviewedAt: z.string().optional()
});
export const SourceInputSchema = z.object({
  name: z.string().min(1).max(200), provider: z.enum(['loc', 'commons']), query: z.string().min(2).max(500),
  warIds: z.array(z.string().max(100)).max(30).default([]), enabled: z.boolean().default(true),
  intervalSeconds: z.number().int().min(60).max(2_592_000).default(3600),
  policy: SourcePolicySchema.default({ status: 'unreviewed', allowAutoPublish: false, metadataOnly: true, rightsLabel: '원 소장처에서 자료별 이용 조건을 확인하세요.' })
}).strict();
export type SourceInput = z.infer<typeof SourceInputSchema>;
export const SourceSchema = SourceInputSchema.extend({ id: z.string(), checkpoint: z.object({ backfillPage: z.number().int().positive(), backfillComplete: z.boolean(), pageSize:z.number().int().min(1).max(50).default(40),refreshOffset:z.number().int().nonnegative().default(0),lastRefreshAt:z.string().nullable().default(null) }), lastCheckedAt: z.string().nullable(), lastSuccessAt: z.string().nullable(), lastError: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() });
export type Source = z.infer<typeof SourceSchema>;
export const ArchiveRecordSchema = z.object({ id: z.string(), sourceId: z.string(), status: z.enum(['draft', 'review', 'published', 'withdrawn']), public: PublicRecordSchema,editorialLocked:z.boolean().optional(),sourceCandidate:PublicRecordSchema.optional(),sourceAvailability:z.enum(['available','unavailable','unknown']).optional(), rawHash: z.string(), processing: z.object({ ocr: z.enum(['not-requested', 'unavailable', 'complete']), translation: z.enum(['not-requested', 'unavailable', 'complete']) }), createdAt: z.string(), updatedAt: z.string() });
export type ArchiveRecord = z.infer<typeof ArchiveRecordSchema>;
export const JobSchema = z.object({ id: z.string(), kind: z.enum(['collect', 'normalize', 'publish','produce','cleanup']), state: z.enum(['queued', 'running', 'retry', 'done', 'failed']), payload: z.record(z.string(), z.unknown()), dedupeKey: z.string(), attempts: z.number().int(), maxAttempts: z.number().int(), runAt: z.string(), leaseUntil: z.string().nullable(), lastError: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() });
export type Job = z.infer<typeof JobSchema>;
export const ProducedFileSchema=z.object({kind:z.enum(['metadata','citation','text','thumbnail']),path:z.string(),mimeType:z.string(),sha256:z.string(),sizeBytes:z.number(),url:z.url().optional(),objectKey:z.string().optional()});
export const ProductionResultSchema=z.object({files:z.array(ProducedFileSchema),text:z.string().optional(),durationSeconds:z.number().optional(),steps:z.array(z.object({operation:z.string(),status:z.enum(['complete','unavailable','not-requested']),reason:z.string().optional()}))});
export const MediaAssetSchema=z.object({id:z.string(),recordId:z.string(),sha256:z.string(),mimeType:z.string(),filePath:z.string(),filename:z.string(),sizeBytes:z.number(),rightsAttestation:z.string().optional(),publishDerivatives:z.boolean(),status:z.enum(['queued','complete','unavailable','failed']),production:ProductionResultSchema.nullable().optional(),createdAt:z.string()});
export type ProducedFile=z.infer<typeof ProducedFileSchema>;
export type ProductionResult=z.infer<typeof ProductionResultSchema>;
export type MediaAsset=z.infer<typeof MediaAssetSchema>;
export interface RawItem { identifier: string; url: string; title: string; description: string; date: string; language: string; kind: PublicRecord['kind']; topics: string[]; thumbnailUrl?: string; license?: string; licenseUrl?: string; attribution?:PublicRecord['media']['attribution'];location?:PublicRecord['location']; sensitive?: boolean; raw: unknown }
export interface CollectionPage { items: RawItem[]; hasMore: boolean; page: number }
export class ArchiveError extends Error { constructor(public readonly code: string, message: string, public readonly statusCode = 400) { super(message); this.name = 'ArchiveError'; } }
