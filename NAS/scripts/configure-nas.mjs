import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.argv.includes('--production')) throw new Error('Use --production on the target NAS only. Existing nonempty secrets are preserved.');
const path = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');
let text = await readFile(path, 'utf8').catch((error) => { if (error.code === 'ENOENT') return ''; throw error; });
const values = parseEnv(text);
const updates = {};
if (!values.WAR_ARCHIVE_ADMIN_TOKEN) updates.WAR_ARCHIVE_ADMIN_TOKEN = randomBytes(32).toString('base64url');
if (!values.POSTGRES_PASSWORD) updates.POSTGRES_PASSWORD = randomBytes(32).toString('hex');
const password = values.POSTGRES_PASSWORD || updates.POSTGRES_PASSWORD;
if (!values.DATABASE_URL) updates.DATABASE_URL = `postgresql://archive:${encodeURIComponent(password)}@db:5432/archive`;
if (!values.GITHUB_FRONT_REPOSITORY) updates.GITHUB_FRONT_REPOSITORY = 'kenitoa/War-Achive';
if (!values.GITHUB_FRONT_CONTENT_PATH) updates.GITHUB_FRONT_CONTENT_PATH = 'Vercel/content/archive.json';
if (!values.GITHUB_FRONT_REF) updates.GITHUB_FRONT_REF = 'main';
for (const [key, value] of Object.entries(updates)) {
  const line = new RegExp(`^${key}=.*$`, 'm');
  text = line.test(text) ? text.replace(line, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
}
await writeFile(path, text, { mode: 0o600 });
console.log(`NAS settings prepared; ${Object.keys(updates).length} missing settings added. Existing secret values were not printed or replaced. Read NAS/.env privately for administrator access.`);
