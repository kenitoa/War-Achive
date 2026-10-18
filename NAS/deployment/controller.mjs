import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { gunzipSync } from 'node:zlib';

const repository = 'kenitoa/War-Achive';
const shaPattern = /^[a-f0-9]{40}$/;
const maxArchiveBytes = 50 * 1024 * 1024;
const requiredSourceFiles = ['Dockerfile', '.dockerignore', 'back/package.json', 'back/package-lock.json', 'admin/package.json', 'admin/package-lock.json'];
const ignoredParts = new Set(['.git', '.vercel', 'node_modules', 'dist', 'out', '.next', 'coverage', 'data', 'releases', 'artifacts', 'backups']);

export function assertCommit(value) {
  if (typeof value !== 'string' || !shaPattern.test(value)) throw new Error('Invalid Git commit identifier');
  return value;
}

function safeRelative(value) {
  if (!value || value.startsWith('/') || value.includes('\\') || value.split('/').some(part => part === '..' || part === '.')) throw new Error('Unsafe archive path');
  return value;
}

function within(root, value) {
  const target = resolve(root, safeRelative(value));
  if (!target.startsWith(resolve(root) + sep)) throw new Error('Path outside deployment root');
  return target;
}

async function directory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Deployment directories must not be symbolic links');
}

async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function atomicJson(path, value) {
  await directory(dirname(path));
  const temporary = `${path}.${randomUUID()}.partial`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await rename(temporary, path);
}

export async function readState(root) {
  try {
    const state = JSON.parse(await readFile(join(root, 'state/current.json'), 'utf8'));
    assertCommit(state.commit);
    if (state.previousCommit !== null && state.previousCommit !== undefined) assertCommit(state.previousCommit);
    return state;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function prepareEnvironment(root) {
  await directory(root);
  for (const part of ['shared', 'state', 'releases', 'backups']) await directory(join(root, part));
  const path = join(root, 'shared/.env');
  let text = '';
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error('Environment file must not be a symbolic link');
    text = await readFile(path, 'utf8');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const values = parseEnv(text), additions = {};
  if (!values.WAR_ARCHIVE_ADMIN_TOKEN) additions.WAR_ARCHIVE_ADMIN_TOKEN = randomBytes(32).toString('base64url');
  if (!values.POSTGRES_PASSWORD) additions.POSTGRES_PASSWORD = randomBytes(32).toString('hex');
  const password = values.POSTGRES_PASSWORD || additions.POSTGRES_PASSWORD;
  if (!values.DATABASE_URL) additions.DATABASE_URL = `postgresql://archive:${encodeURIComponent(password)}@db:5432/archive`;
  if (!values.GITHUB_FRONT_REPOSITORY) additions.GITHUB_FRONT_REPOSITORY = repository;
  if (!values.GITHUB_FRONT_REF) additions.GITHUB_FRONT_REF = 'main';
  if (!values.GITHUB_FRONT_CONTENT_PATH) additions.GITHUB_FRONT_CONTENT_PATH = 'Vercel/content/archive.json';
  if (!values.PUBLIC_ARCHIVE_VERIFY_URL) additions.PUBLIC_ARCHIVE_VERIFY_URL = 'https://kenitoa-war-achive.vercel.app/release.json';
  if (!values.ADMIN_PORT) additions.ADMIN_PORT = '9231';
  if (!values.REMOTE_PUBLISH_ENABLED) additions.REMOTE_PUBLISH_ENABLED = 'false';
  const combined = { ...values, ...additions };
  if (combined.WAR_ARCHIVE_ADMIN_TOKEN.length < 24 || combined.POSTGRES_PASSWORD.length < 24) throw new Error('Production secrets must contain at least 24 characters');
  const databaseUrl = new URL(combined.DATABASE_URL);
  if (!['postgresql:', 'postgres:'].includes(databaseUrl.protocol) || databaseUrl.hostname !== 'db' || databaseUrl.username !== 'archive' || databaseUrl.pathname !== '/archive' || decodeURIComponent(databaseUrl.password) !== password) throw new Error('DATABASE_URL must select the dedicated archive database and match POSTGRES_PASSWORD');
  const port = Number(combined.ADMIN_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid ADMIN_PORT');
  for (const [key, value] of Object.entries(additions)) text = `${text.trimEnd()}\n${key}=${value}\n`;
  if (Object.keys(additions).length) await writeFile(path, text, { mode: 0o600 });
  return { port, additions: Object.keys(additions) };
}

export function deploymentCompose(hostRoot, commit, port = 9231) {
  assertCommit(commit);
  if (!isAbsolute(hostRoot) || hostRoot.includes('\n') || hostRoot.includes('\r') || hostRoot === '/') throw new Error('An absolute dedicated host directory is required');
  const image = `war-archive-backend:${commit}`;
  const environment = { NODE_ENV: 'production', DATABASE_URL: '${DATABASE_URL:?Missing DATABASE_URL}', DATA_DIR: '/var/lib/war-archive', EXPORT_DIR: '/var/lib/war-archive-releases' };
  const sshSecrets = ['github_deploy_key', 'github_known_hosts'].map(name => ({ type: 'bind', source: `${hostRoot}/shared/secrets/${name}`, target: `/run/secrets/${name}`, read_only: true, bind: { create_host_path: false } }));
  const common = { image, restart: 'unless-stopped', init: true, env_file: [`${hostRoot}/shared/.env`], environment, volumes: ['archive-data:/var/lib/war-archive', 'archive-releases:/var/lib/war-archive-releases', ...sshSecrets], networks: ['private'], security_opt: ['no-new-privileges:true'], cap_drop: ['ALL'], stop_grace_period: '35s' };
  return {
    name: 'war-archive',
    services: {
      db: { image: 'postgres:17-alpine', restart: 'unless-stopped', environment: { POSTGRES_USER: 'archive', POSTGRES_DB: 'archive', POSTGRES_PASSWORD: '${POSTGRES_PASSWORD:?Missing POSTGRES_PASSWORD}' }, volumes: ['postgres-data:/var/lib/postgresql/data'], healthcheck: { test: ['CMD-SHELL', 'pg_isready -U archive -d archive'], interval: '10s', timeout: '5s', retries: 10 }, networks: ['private'] },
      api: { ...common, build: { context: `${hostRoot}/releases/${commit}`, dockerfile: 'Dockerfile' }, environment: { ...environment, HOST: '0.0.0.0', ADMIN_PORT: 4310 }, ports: [`127.0.0.1:${port}:4310`], depends_on: { db: { condition: 'service_healthy' } }, healthcheck: { test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:4310/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], interval: '10s', timeout: '5s', start_period: '30s', retries: 12 } },
      worker: { ...common, command: ['node', 'dist/workers/run.js'], depends_on: { api: { condition: 'service_healthy' } }, healthcheck: { test: ['CMD', 'node', '-e', "const f=require('node:fs');try{const h=JSON.parse(f.readFileSync('/var/lib/war-archive/worker-heartbeat.json'));process.exit(Date.now()-Date.parse(h.at)<120000?0:1)}catch{process.exit(1)}"], interval: '15s', timeout: '5s', start_period: '45s', retries: 6 } },
      publicgateway: { image: `war-archive-gateway:${commit}`, build: { context: `${hostRoot}/releases/${commit}/gateway`, dockerfile: 'Dockerfile' }, restart: 'unless-stopped', init: true, environment: { NODE_ENV: 'production', HOST: '0.0.0.0', PORT: 8080, API_ORIGIN: 'http://api:4310', PUBLIC_PATH_PREFIX: '/war-archive-api' }, ports: ['127.0.0.1:9232:8080'], depends_on: { api: { condition: 'service_healthy' } }, networks: ['private'], security_opt: ['no-new-privileges:true'], cap_drop: ['ALL'], healthcheck: { test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], interval: '10s', timeout: '5s', start_period: '10s', retries: 6 }, stop_grace_period: '15s' },
    },
    volumes: { 'postgres-data': { name: 'war-archive-postgres' }, 'archive-data': { name: 'war-archive-data' }, 'archive-releases': { name: 'war-archive-releases' } },
    networks: { private: {} },
  };
}

function headerText(header, start, length) {
  return header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
}

export function archiveFiles(bytes, commit) {
  assertCommit(commit);
  if (bytes.length > maxArchiveBytes) throw new Error('Source archive exceeds size limit');
  const tar = gunzipSync(bytes, { maxOutputLength: 150 * 1024 * 1024 });
  const files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const storedChecksum = headerText(header, 148, 8).trim();
    if (!/^[0-7]+$/.test(storedChecksum) || header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0) !== parseInt(storedChecksum, 8)) throw new Error('Archive header checksum does not match');
    const name = headerText(header, 0, 100), prefix = headerText(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const sizeText = headerText(header, 124, 12).trim();
    if (!/^[0-7]+$/.test(sizeText)) throw new Error('Invalid archive entry size');
    const size = parseInt(sizeText, 8), type = String.fromCharCode(header[156] || 48);
    if (!Number.isSafeInteger(size) || size > 20 * 1024 * 1024 || offset + 512 + size > tar.length) throw new Error('Invalid archive entry bounds');
    const body = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'g') continue; // GitHub's global PAX commit annotation has no file contents.
    safeRelative(fullName.replace(/\/$/, ''));
    const parts = fullName.replace(/\/$/, '').split('/');
    if (parts[0] !== `War-Achive-${commit}`) throw new Error('Archive root does not match pinned commit');
    if (parts[1] !== 'NAS' || parts.length < 3) continue;
    if (!['0', '5'].includes(type)) throw new Error('Links and special files are forbidden in NAS releases');
    const local = parts.slice(2).join('/');
    if (type === '5') continue;
    if (parts.slice(2).some(part => ignoredParts.has(part) || (part.startsWith('.env') && part !== '.env.example'))) continue;
    if (files.has(local)) throw new Error('Duplicate archive path');
    files.set(local, Buffer.from(body));
  }
  for (const path of requiredSourceFiles) if (!files.has(path)) throw new Error(`Incomplete NAS release: ${path}`);
  return files;
}

async function request(url, token, limit) {
  let current = new URL(url);
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (current.protocol !== 'https:' || !['api.github.com', 'codeload.github.com'].includes(current.hostname) || current.username || current.password) throw new Error('Unexpected GitHub source endpoint');
    const headers = { 'User-Agent': 'War-Archive-NAS-Updater/1', Accept: 'application/vnd.github+json' };
    if (token && current.hostname === 'api.github.com') headers.Authorization = `Bearer ${token}`;
    const response = await fetch(current, { headers, redirect: 'manual', signal: AbortSignal.timeout(90_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) { current = new URL(response.headers.get('location'), current); continue; }
    if (!response.ok) throw new Error(`GitHub source request failed (HTTP ${response.status})`);
    if (Number(response.headers.get('content-length') || 0) > limit) throw new Error('GitHub response exceeds limit');
    const chunks = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.length; if (length > limit) throw new Error('GitHub response exceeds limit'); chunks.push(Buffer.from(chunk)); }
    return Buffer.concat(chunks);
  }
  throw new Error('Too many source redirects');
}

export async function fetchRelease(root, hostRoot, explicitCommit) {
  const environment = await prepareEnvironment(root);
  let token;
  try { token = (await readFile(join(root, 'shared/github-read-token'), 'utf8')).trim(); if (!token || token.length > 4096 || /\s/.test(token)) throw new Error('Invalid read credential file'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let commit;
  if (explicitCommit) commit = assertCommit(explicitCommit);
  else {
    const commits = JSON.parse((await request(`https://api.github.com/repos/${repository}/commits?sha=main&path=NAS&per_page=1`, token, 1024 * 1024)).toString('utf8'));
    commit = assertCommit(commits?.[0]?.sha);
  }
  const target = join(root, 'releases', commit);
  if (await exists(target)) {
    const metadata = await lstat(target);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Release paths must be ordinary directories');
  }
  if (!await exists(join(target, 'release-source.json'))) {
    if (await exists(target)) throw new Error('Incomplete release directory already exists; inspect it without overwriting');
    const bytes = await request(`https://codeload.github.com/${repository}/tar.gz/${commit}`, token, maxArchiveBytes);
    const files = archiveFiles(bytes, commit), temporary = join(root, 'releases', `.incoming-${randomUUID()}`);
    await directory(temporary);
    for (const [path, contents] of files) { const output = within(temporary, path); await directory(dirname(output)); await writeFile(output, contents, { flag: 'wx', mode: 0o644 }); }
    await atomicJson(join(temporary, 'release-source.json'), { repository, commit, downloadedAt: new Date().toISOString(), archiveSha256: createHash('sha256').update(bytes).digest('hex'), files: files.size });
    await rename(temporary, target);
  }
  await atomicJson(join(target, 'compose.deploy.json'), deploymentCompose(hostRoot, commit, environment.port));
  await writeFile(join(root, 'state/candidate-commit'), commit + '\n', { mode: 0o600 });
  const current = await readState(root);
  console.log(JSON.stringify({ operation: 'deployment.fetch', status: current?.commit === commit ? 'current' : 'ready', commit }));
  return commit;
}

export async function activate(root, commit) {
  assertCommit(commit);
  const current = await readState(root);
  await writeFile(join(root, 'state/current-commit'), commit + '\n', { mode: 0o600 });
  await atomicJson(join(root, 'state/current.json'), { repository, commit, previousCommit: current?.commit === commit ? current.previousCommit ?? null : current?.commit ?? null, activatedAt: new Date().toISOString() });
  console.log(JSON.stringify({ operation: 'deployment.activate', status: 'complete', commit }));
}

async function main() {
  const [command, root, hostRoot, commit] = process.argv.slice(2);
  if (!root || !isAbsolute(root) || root === '/') throw new Error('An absolute dedicated deployment directory is required');
  if (command === 'prepare') { const result = await prepareEnvironment(root); console.log(JSON.stringify({ operation: 'deployment.prepare', status: 'complete', settingsAdded: result.additions })); }
  else if (command === 'fetch') await fetchRelease(root, hostRoot, commit);
  else if (command === 'activate') await activate(root, assertCommit(hostRoot));
  else if (command === 'current') console.log((await readState(root))?.commit ?? '');
  else throw new Error('Supported commands: prepare, fetch, current, activate');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(JSON.stringify({ operation: 'deployment', status: 'failed', message: error.message })); process.exitCode = 1; });
