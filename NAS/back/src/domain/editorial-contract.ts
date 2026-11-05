import { z } from 'zod';


export const EditorialStatus = z.enum(['draft','review','approved','scheduled','publishing','published','failed','withdrawn']);
export const EvidenceSchema = z.object({ recordId:z.string().min(1), revision:z.number().int().positive(), title:z.string(), url:z.url().refine(url=>/^https?:\/\//.test(url)), publisher:z.string(), date:z.string(), rights:z.string() });
export const BlockSchema = z.object({ heading:z.string().trim().min(1).max(200), text:z.string().trim().min(1).max(6000), evidenceIds:z.array(z.string().min(1)).min(1).max(20) }).strict();
export const DocumentSchema = z.object({ title:z.string().trim().min(1).max(240), summary:z.string().trim().min(1).max(1000), blocks:z.array(BlockSchema).min(1).max(40), evidence:z.array(EvidenceSchema).min(1).max(20), analysis:z.object({ method:z.literal('catalogue-analysis-v1'), languages:z.array(z.string()), topics:z.array(z.string()), warnings:z.array(z.string()), recordCount:z.number().int() }), approval:z.object({ contentReviewed:z.boolean(), rightsReviewed:z.boolean(), actor:z.string(), at:z.string() }).optional() });
export type EditorialDocument = z.infer<typeof DocumentSchema>;
export const CreateArticleSchema = z.object({ recordIds:z.array(z.string().min(1).max(150)).min(1).max(20).refine(ids=>new Set(ids).size===ids.length), title:z.string().trim().min(1).max(240).optional() }).strict();
export const EditArticleSchema = z.object({ expectedRevision:z.number().int().positive(), title:z.string().trim().min(1).max(240), summary:z.string().trim().min(1).max(1000), blocks:z.array(BlockSchema).min(1).max(40) }).strict();
export const DecisionSchema = z.object({ expectedRevision:z.number().int().positive(), decision:z.enum(['approve','reject','withdraw','retry']), contentReviewed:z.boolean().optional(), rightsReviewed:z.boolean().optional(), publishAt:z.iso.datetime().optional(), note:z.string().trim().min(1).max(2000) }).strict();
export const ArticleSchema=z.object({id:z.string(),slug:z.string(),status:EditorialStatus,revision:z.number().int().positive(),document:DocumentSchema,attempts:z.number().int(),lastError:z.string().nullable(),runAt:z.string(),updatedAt:z.string()});
export type EditorialArticle=z.infer<typeof ArticleSchema>;
export const ArticleListSchema=z.object({items:z.array(ArticleSchema),total:z.number().int(),page:z.number().int(),pages:z.number().int(),counts:z.record(z.string(),z.number())});

