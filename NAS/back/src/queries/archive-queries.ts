import { z } from 'zod';
import type { Database } from '../infrastructure/database.js';
import { ArchiveRecordSchema, JobSchema, SourceSchema } from '../domain/models.js';

export const PageQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50), status: z.enum(['draft', 'review', 'published', 'withdrawn']).optional(), q: z.string().trim().max(200).optional() }).strict();
type Query = z.infer<typeof PageQuerySchema>;
type Kind = 'records' | 'sources' | 'jobs' | 'publications' | 'audit' | 'requests';
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);

export class ArchiveQueries {
  constructor(private readonly db: Database) {}
  async list(kind: Kind, raw: unknown) {
    const query: Query = PageQuerySchema.parse(raw);
    const definitions = {
      records: { table: 'records', select: 'data', order: 'updated_at DESC,id' },
      sources: { table: 'sources', select: 'data', order: 'updated_at DESC,id' },
      jobs: { table: 'jobs', select: '*', order: 'created_at DESC,id' },
      publications: { table: 'publications', select: 'id,target,status,record_count AS "recordCount",manifest,created_at AS "createdAt",published_at AS "publishedAt",last_error AS "lastError"', order: 'created_at DESC,id' },
      audit: { table: 'audit_log', select: 'id,operation,actor,resource_id AS "resourceId",detail,created_at AS "createdAt"', order: 'created_at DESC,id' },
      requests: { table: 'requests', select: 'id,kind,record_id AS "recordId",message,contact,status,resolution,created_at AS "createdAt",updated_at AS "updatedAt"', order: 'created_at DESC,id' },
    } as const;
    const definition = definitions[kind], clauses: string[] = [], parameters: unknown[] = [];
    if (query.status && kind === 'records') { parameters.push(query.status); clauses.push(`status=$${parameters.length}`); }
    if (query.q && (kind === 'records' || kind === 'sources')) {
      parameters.push(`%${query.q.replace(/[\\%_]/g, '\\$&')}%`);
      clauses.push(`${kind === 'records' ? "data->'public'->>'title'" : "data->>'name'"} ILIKE $${parameters.length}`);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const total = Number((await this.db.query(`SELECT count(*) AS n FROM ${definition.table}${where}`, parameters)).rows[0]?.n ?? 0);
    const rows = (await this.db.query(`SELECT ${definition.select} FROM ${definition.table}${where} ORDER BY ${definition.order} LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`, [...parameters, query.pageSize, (query.page - 1) * query.pageSize])).rows;
    const items = rows.map((row) => {
      if (kind === 'records') return ArchiveRecordSchema.parse(row.data);
      if (kind === 'sources') return SourceSchema.parse(row.data);
      if (kind === 'jobs') return JobSchema.parse({ id: row.id, kind: row.kind, state: row.state, payload: row.payload, dedupeKey: row.dedupe_key, attempts: row.attempts, maxAttempts: row.max_attempts, runAt: iso(row.run_at), leaseUntil: row.lease_until ? iso(row.lease_until) : null, lastError: row.last_error, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) });
      return row;
    });
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
