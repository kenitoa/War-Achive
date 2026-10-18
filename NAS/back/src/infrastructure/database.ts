import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';

export interface QueryResult<T> { rows: T[]; rowCount: number }
export interface Executor { query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> }
export interface Database extends Executor { transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>; close(): Promise<void>; dump?(): Promise<Blob> }
export async function openDatabase(options: { databaseUrl?: string; pglitePath?: string }): Promise<Database> {
  if (options.databaseUrl) {
    const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 10, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
    return { async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) { const r = await pool.query<T>(sql, params); return { rows: r.rows, rowCount: r.rowCount ?? 0 }; }, async transaction<T>(fn: (tx: Executor) => Promise<T>) { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await fn({ async query<R extends Record<string, unknown>>(sql: string, params: unknown[] = []) { const r = await client.query<R>(sql, params); return { rows: r.rows, rowCount: r.rowCount ?? 0 }; } }); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }, async close() { await pool.end(); } };
  }
  const db = new PGlite(options.pglitePath ?? 'memory://');
  await db.waitReady;
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const task = tail.then(fn); tail = task.catch(() => undefined); return task; };
  const query = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> => { const r = await db.query<T>(sql, params); return { rows: r.rows, rowCount: Math.max(r.affectedRows ?? 0,r.rows.length) }; };
  return { query: (sql, params) => serial(() => query(sql, params)), transaction: (fn) => serial(async () => { await db.exec('BEGIN'); try { const result = await fn({ query }); await db.exec('COMMIT'); return result; } catch (error) { await db.exec('ROLLBACK'); throw error; } }), close: () => serial(() => db.close()), dump: () => serial(() => db.dumpDataDir()) };
}
export async function migrate(db: Database): Promise<void> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const directory = new URL('../../migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter((f) => /^\d+.*\.sql$/.test(f)).sort()) {
    const applied = await db.query('SELECT version FROM schema_migrations WHERE version=$1', [file]);
    if (applied.rows.length) continue;
    const sql = await readFile(new URL(file, directory), 'utf8');
    await db.transaction(async (tx) => { for (const statement of sql.split(';').map((s) => s.trim()).filter(Boolean)) await tx.query(statement); await tx.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]); });
  }
}
