// Executed through stdin inside the isolated restored API container. No secrets are logged.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const issues = {};
const addIssue = code => { issues[code] = (issues[code] ?? 0) + 1; };
const digest = async path => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};
const checked = new Set();
async function file(root, path, expected, kind) {
  if (typeof path !== 'string' || !/^[a-f0-9]{64}$/.test(expected ?? '')) { addIssue(kind + ':invalid'); return; }
  const key = `${kind}:${path}:${expected}`;
  if (checked.has(key)) return;
  try {
    const actual = await realpath(resolve(path));
    if (!actual.startsWith(root + sep) || !(await stat(actual)).isFile()) throw new Error();
    if (await digest(actual) !== expected) throw new Error();
    checked.add(key);
  } catch { addIssue(kind + ':integrity'); }
}
try {
  let health;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { health = await fetch('http://127.0.0.1:4310/healthz', { signal: AbortSignal.timeout(3000) }); if (health.ok) break; } catch { /* Startup is bounded below. */ }
    await delay(1000);
  }
  if (!health?.ok) throw new Error('RESTORED_API_UNHEALTHY');
  const roots = { data: await realpath(process.env.DATA_DIR), releases: await realpath(process.env.EXPORT_DIR) };
  const counts = {};
  for (const table of ['schema_migrations', 'records', 'record_versions', 'raw_items', 'media_assets', 'productions', 'publications', 'members', 'member_shelves', 'member_sessions', 'member_reset_tokens']) {
    counts[table] = Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
  }
  if (!counts.schema_migrations || !counts.records || !counts.record_versions) addIssue('database:empty');
  if (counts.member_sessions || counts.member_reset_tokens) addIssue('session:revocation');
  for (const row of (await db.query("SELECT DISTINCT raw_hash AS hash,file_path FROM raw_items UNION ALL SELECT DISTINCT sha256 AS hash,file_path FROM media_assets")).rows) {
    await file(roots.data, row.file_path, row.hash, 'original');
  }
  for (const row of (await db.query('SELECT data FROM productions')).rows) {
    if (!Array.isArray(row.data?.files) || !row.data.files.length) { addIssue('production:inventory'); continue; }
    for (const item of row.data.files) await file(roots.data, item.path, item.sha256, 'production');
  }
  let releasesVerified = 0;
  for (const row of (await db.query("SELECT id,manifest FROM publications WHERE status IN ('published','prepared')")).rows) {
    if (!/^rel-[a-zA-Z0-9-]+$/.test(row.id)) { addIssue('release:invalidId'); continue; }
    try {
      const path = resolve(roots.releases, row.id);
      const actual = await realpath(path);
      if (!actual.startsWith(roots.releases + sep)) throw new Error();
      const snapshot = JSON.parse(await readFile(resolve(path, 'archive.json'), 'utf8'));
      const manifest = JSON.parse(await readFile(resolve(path, 'manifest.json'), 'utf8'));
      const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
      if (hash !== row.manifest.sha256 || hash !== manifest.sha256 || snapshot.records.length !== manifest.recordCount) throw new Error();
      releasesVerified++;
    } catch { addIssue('release:integrity'); }
  }
  const adminPage = await fetch('http://127.0.0.1:4310/admin/');
  if (!adminPage.ok || !(await adminPage.text()).includes('<html')) addIssue('admin:page');
  const anonymous = await fetch('http://127.0.0.1:4310/api/v1/overview');
  if (anonymous.status !== 401) addIssue('admin:authentication');
  const login = await fetch('http://127.0.0.1:4310/api/v1/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: process.env.WAR_ARCHIVE_ADMIN_TOKEN }) });
  const identity = await login.json();
  const cookies = login.headers.get('set-cookie')?.split(';')[0];
  if (!login.ok || !cookies || !identity.data?.authenticated) addIssue('admin:login');
  else {
    const overview = await fetch('http://127.0.0.1:4310/api/v1/overview', { headers: { Cookie: cookies } });
    const body = await overview.json();
    if (!overview.ok || body.data?.records !== counts.records || body.data?.remoteEnabled !== false) addIssue('admin:overview');
  }
  if (process.env.AUTO_PUBLISH_ENABLED !== 'false' || process.env.REMOTE_PUBLISH_ENABLED !== 'false' || process.env.LOCAL_WORKER_ENABLED !== 'false') addIssue('isolation:worker');
  const verifiedOriginalFiles = [...checked].filter(key => key.startsWith('original:')).length;
  const verifiedProductionFiles = [...checked].filter(key => key.startsWith('production:')).length;
  console.log(JSON.stringify({ status: Object.keys(issues).length ? 'failed' : 'passed', counts, verifiedOriginalFiles, verifiedProductionFiles, releasesVerified, checks: { apiHealth: health.ok, adminPage: adminPage.ok, anonymousAdminDenied: anonymous.status === 401, isolatedAdminLogin: login.ok, preservedSessionsRevoked: counts.member_sessions === 0 && counts.member_reset_tokens === 0, workerAndRemotePublicationDisabled: process.env.LOCAL_WORKER_ENABLED === 'false' && process.env.REMOTE_PUBLISH_ENABLED === 'false' }, issues }));
  process.exitCode = Object.keys(issues).length ? 1 : 0;
} catch {
  console.log(JSON.stringify({ status: 'failed', code: 'RESTORED_ARCHIVE_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally { await db.end(); }
