import { mkdir, readdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const nasRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = process.env.VERCEL_PROJECT_ID;
const orgId = process.env.VERCEL_ORG_ID;
if (!projectId || !orgId) throw new Error('Set VERCEL_PROJECT_ID and VERCEL_ORG_ID for the verified deployment target.');
const source = resolve(nasRoot, '../Vercel');
const target = resolve(nasRoot, 'artifacts', `vercel-stage-${randomUUID()}`);
const excluded = new Set(['node_modules', '.next', 'out', 'dist', 'artifacts', '.vercel', '.git', 'coverage']);
async function copy(directory, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.startsWith('.env') || /\.(?:log|tsbuildinfo)$/.test(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error('Deployment source must not contain symbolic links.');
    if (entry.isDirectory()) await copy(join(directory, entry.name), join(destination, entry.name));
    else if (entry.isFile()) await copyFile(join(directory, entry.name), join(destination, entry.name));
  }
}
await copy(source, join(target, 'Vercel'));
await mkdir(join(target, '.vercel'));
await writeFile(join(target, '.vercel/project.json'), JSON.stringify({ projectId, orgId }));
const snapshot = JSON.parse(await readFile(join(target, 'Vercel/content/archive.json'), 'utf8'));
console.log(JSON.stringify({ stage: target, projectId, releaseId: snapshot.releaseId, records: snapshot.records?.length, includes: ['Vercel'], excludes: ['NAS', '.env', 'node_modules', 'local data'] }));
