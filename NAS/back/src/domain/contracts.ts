import { z } from 'zod';
const HttpUrl = z.url().refine((value) => /^https?:\/\//i.test(value), 'HTTP(S) URL required');

export const LocationSchema = z.object({ name: z.string(), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), precision: z.enum(['exact', 'approximate', 'region']) });
export const WarSchema = z.object({ id: z.string(), name: z.string(), aliases: z.array(z.string()), period: z.string(), summary: z.string(), sourceUrl: HttpUrl, regions: z.array(z.string()) });
export const EntitySchema = z.object({ id: z.string(), name: z.string(), type: z.enum(['person', 'organization', 'place', 'equipment', 'event']), summary: z.string(), warIds: z.array(z.string()), sourceUrl: HttpUrl.optional(), location: LocationSchema.optional() });
export const CollectionSchema = z.object({ id: z.string(), title: z.string(), summary: z.string(), recordIds: z.array(z.string()), topics: z.array(z.string()) });
export const ClaimSchema = z.object({ id: z.string(), subjectId: z.string(), statement: z.string(), source: z.object({ label: z.string(), url: HttpUrl, page: z.string().optional(), timecode: z.string().optional() }), scope: z.object({ population: z.string().optional(), period: z.string().optional(), region: z.string().optional() }), value: z.string().optional(), unit: z.string().optional(), status: z.enum(['reported', 'supported', 'disputed']), public: z.boolean().default(false) });
export const PublicRecordSchema = z.object({
  id: z.string(), title: z.string(), originalTitle: z.string().optional(), summary: z.string(),
  kind: z.enum(['document', 'photograph', 'map', 'video', 'audio', 'newspaper', 'dataset', 'object', 'research']), language: z.string(),
  source: z.object({ name: z.string(), url: HttpUrl, identifier: z.string(), accessedAt: z.iso.datetime() }),
  dates: z.object({ display: z.string(), start: z.string().optional(), end: z.string().optional(), precision: z.enum(['exact', 'year', 'range', 'circa', 'unknown']) }),
  warIds: z.array(z.string()), entityIds: z.array(z.string()), topics: z.array(z.string()),
  rights: z.object({ label: z.string(), url: HttpUrl.optional(), downloadAllowed: z.boolean(), reuseAllowed: z.boolean() }),
  review: z.object({ provenance: z.enum(['checked', 'unverified']), content: z.enum(['source-description', 'reviewed', 'machine-draft']), translation: z.enum(['none', 'machine', 'reviewed']) }),
  media: z.object({ thumbnailUrl: HttpUrl.optional(), originalUrl: HttpUrl.optional(), mimeType: z.string().optional(), pages: z.number().int().positive().optional(), durationSeconds: z.number().nonnegative().optional(),displayAllowed:z.boolean().default(false), attribution:z.object({creator:z.string(),credit:z.string(),license:z.string(),licenseUrl:HttpUrl}).optional() }),
  transcript: z.string().optional(), translation: z.string().optional(),
  citations: z.array(z.object({ label: z.string(), url: HttpUrl, page: z.string().optional(), timecode: z.string().optional() })),
  revision: z.number().int().positive(), updatedAt: z.iso.datetime(), sensitivity: z.enum(['none', 'warning']), location: LocationSchema.optional(), changes: z.array(z.object({ at: z.iso.datetime(), summary: z.string() })).optional()
});
export const PublicArchiveSchema = z.object({ schemaVersion: z.literal(1), releaseId: z.string(), generatedAt: z.iso.datetime(), records: z.array(PublicRecordSchema), wars: z.array(WarSchema), entities: z.array(EntitySchema), collections: z.array(CollectionSchema), claims: z.array(ClaimSchema).optional(), coverage: z.object({ sources: z.number().int().nonnegative(), records: z.number().int().nonnegative(), lastCollectedAt: z.string().nullable(), limitations: z.array(z.string()) }).optional() });
export type PublicRecord = z.infer<typeof PublicRecordSchema>;
export type PublicArchive = z.infer<typeof PublicArchiveSchema>;
export type War = z.infer<typeof WarSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Collection = z.infer<typeof CollectionSchema>;
