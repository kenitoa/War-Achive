import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { activate, archiveFiles, assertCommit, deploymentCompose, prepareEnvironment, readState, refreshBootstrap } from '../controller.mjs';

const first = 'a'.repeat(40), second = 'b'.repeat(40);
function archive(entries) {
  const output = [];
  for (const { name, text = '', type = '0' } of entries) {
    const header = Buffer.alloc(512), bytes = Buffer.from(text);
    header.write(name, 0, 100);
    header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124, 12);
    header[156] = type.charCodeAt(0);
    header.fill(32, 148, 156);
    const checksum = header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0');
    header.write(checksum + '\0 ', 148, 8);
    output.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...output, Buffer.alloc(1024)]));
}
function sourceEntries() {
  return ['Dockerfile', '.dockerignore', 'back/package.json', 'back/package-lock.json', 'admin/package.json', 'admin/package-lock.json'].map(name => ({ name: `War-Achive-${first}/NAS/${name}`, text: 'source' }));
}

test('archive extraction includes only pinned NAS source and excludes secrets, data and frontend', () => {
  const files = archiveFiles(archive([...sourceEntries(), { name: `War-Achive-${first}/NAS/.env`, text: 'SECRET=private' }, { name: `War-Achive-${first}/NAS/.env.example`, text: 'KEY=' }, { name: `War-Achive-${first}/NAS/data/database.bin`, text: 'database' }, { name: `War-Achive-${first}/Vercel/page.tsx`, text: 'frontend' }]), first);
  assert.equal(files.size, 7);
  assert.equal(files.get('.env.example').toString(), 'KEY=');
  assert.equal(files.has('.env'), false);
  assert.equal(files.has('data/database.bin'), false);
});

test('unsafe archive paths, symbolic links, wrong commits and truncated sources are rejected', () => {
  assert.throws(() => archiveFiles(archive([...sourceEntries(), { name: `War-Achive-${first}/NAS/../../escape`, text: 'bad' }]), first), /Unsafe archive path/);
  assert.throws(() => archiveFiles(archive([...sourceEntries(), { name: `War-Achive-${first}/NAS/link`, type: '2' }]), first), /Links and special files/);
  assert.throws(() => archiveFiles(archive(sourceEntries()), second), /pinned commit/);
  assert.throws(() => archiveFiles(archive(sourceEntries().slice(1)), first), /Incomplete NAS release/);
  assert.throws(() => assertCommit('main; echo unsafe'), /Invalid Git commit/);
});

test('managed compose keeps dedicated stable volumes, loopback port and secrets outside the release/image', () => {
  const compose = deploymentCompose('/volume3/docker/War_Archive_Server', first);
  assert.equal(compose.services.api.image, `war-archive-backend:${first}`);
  assert.deepEqual(compose.services.api.ports, ['127.0.0.1:9231:4310']);
  assert.equal(compose.volumes['postgres-data'].name, 'war-archive-postgres');
  assert.deepEqual(compose.services.api.env_file, ['/volume3/docker/War_Archive_Server/shared/.env']);
  assert.equal(compose.services.db.ports, undefined);
  assert.equal(compose.services.api.environment.DATABASE_URL, '${DATABASE_URL:?Missing DATABASE_URL}');
  for (const service of ['api', 'worker']) {
    const mounts = compose.services[service].volumes.filter(value => typeof value === 'object');
    assert.deepEqual(mounts.map(mount => mount.target), ['/run/secrets/github_deploy_key', '/run/secrets/github_known_hosts']);
    assert.equal(mounts.every(mount => mount.read_only === true && mount.bind.create_host_path === false), true);
  }
  assert.deepEqual(compose.services.publicgateway.ports, ['127.0.0.1:9232:8080']);
  assert.equal(compose.services.publicgateway.environment.API_ORIGIN, 'http://api:4310');
  assert.equal(compose.services.publicgateway.environment.PUBLIC_PATH_PREFIX, '/war-archive-api');
  assert.equal(compose.services.publicgateway.env_file, undefined);
  assert.equal(compose.services.publicgateway.volumes, undefined);
  assert.equal(JSON.stringify(compose).includes('docker.sock'), false);
  assert.throws(() => deploymentCompose('/', first), /dedicated host directory/);
});

test('production settings generate missing secrets and preserve existing private settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'war-deploy-env-'));
  try {
    const result = await prepareEnvironment(root);
    const path = join(root, 'shared/.env'), initial = await readFile(path, 'utf8'), values = parseEnv(initial);
    assert.equal(result.port, 9231);
    assert.ok(values.WAR_ARCHIVE_ADMIN_TOKEN.length >= 24);
    assert.ok(values.POSTGRES_PASSWORD.length >= 24);
    assert.equal(values.REMOTE_PUBLISH_ENABLED, 'false');
    assert.equal(new URL(values.DATABASE_URL).hostname, 'db');
    await prepareEnvironment(root);
    assert.equal(await readFile(path, 'utf8'), initial);
    await writeFile(path, initial.replace('ADMIN_PORT=9231', 'ADMIN_PORT=80'));
    await assert.rejects(() => prepareEnvironment(root), /Invalid ADMIN_PORT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('activation records rollback target only after explicit success and retries preserve the previous image', async () => {
  const root = await mkdtemp(join(tmpdir(), 'war-deploy-state-'));
  try {
    await mkdir(join(root, 'state'));
    assert.equal(await readState(root), null);
    await activate(root, first);
    assert.equal((await readState(root)).previousCommit, null);
    await activate(root, second);
    await activate(root, second);
    assert.equal((await readState(root)).commit, second);
    assert.equal((await readState(root)).previousCommit, first);
    assert.equal((await readdir(join(root, 'state'))).some(name => name.endsWith('.partial')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function bootstrapFixture() {
  const root = await mkdtemp(join(tmpdir(), 'war-deploy-bootstrap-'));
  await mkdir(join(root, 'state'));
  await mkdir(join(root, 'deployment'));
  const source = join(root, 'releases', first);
  await mkdir(join(source, 'deployment'), { recursive: true });
  await writeFile(join(source, 'release-source.json'), JSON.stringify({ repository: 'kenitoa/War-Achive', commit: first }));
  await writeFile(join(root, 'deployment/controller.mjs'), 'export const version = "previous";\n');
  await writeFile(join(root, 'deployment/update.sh'), '#!/bin/sh\nprintf previous\n');
  await writeFile(join(source, 'deployment/controller.mjs'), 'export const version = "next";\n');
  await writeFile(join(source, 'deployment/update.sh'), '#!/bin/sh\nprintf next\n');
  await writeFile(join(source, 'deployment/export-backup.sh'), '#!/bin/sh\nprintf backup\n');
  for (const name of ['package-backup.py', 'prepare-backup-rehearsal.py', 'verify-recovery-runtime.py']) await writeFile(join(source, 'deployment', name), 'print("backup helper")\n');
  await mkdir(join(source, 'scripts'));
  await writeFile(join(source, 'scripts/encrypt-backup.mjs'), 'export const encryptionHelper = true;\n');
  return { root, source, options: { shell: process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/sh' } };
}

test('bootstrap refresh replaces validated files by rename and preserves an already open updater inode', async () => {
  const { root, options } = await bootstrapFixture();
  let running;
  try {
    // Windows denies replacement of an open file; the NAS runs Linux.
    if (process.platform !== 'win32') running = await open(join(root, 'deployment/update.sh'), 'r');
    await activate(root, first);
    await refreshBootstrap(root, first, options);
    assert.equal(await readFile(join(root, 'deployment/controller.mjs'), 'utf8'), 'export const version = "next";\n');
    assert.equal(await readFile(join(root, 'deployment/update.sh'), 'utf8'), '#!/bin/sh\nprintf next\n');
    assert.equal(await readFile(join(root, 'deployment/package-backup.py'), 'utf8'), 'print("backup helper")\n');
    assert.equal(await readFile(join(root, 'deployment/encrypt-backup.mjs'), 'utf8'), 'export const encryptionHelper = true;\n');
    if (running) assert.equal(await running.readFile('utf8'), '#!/bin/sh\nprintf previous\n');
    const receipt = JSON.parse(await readFile(join(root, 'state/bootstrap.json'), 'utf8'));
    assert.equal(receipt.commit, first);
    assert.deepEqual(receipt.files.map(file => file.name), ['controller.mjs', 'update.sh', 'export-backup.sh', 'package-backup.py', 'prepare-backup-rehearsal.py', 'verify-recovery-runtime.py', 'encrypt-backup.mjs']);
    assert.equal((await readdir(join(root, 'deployment'))).some(name => name.endsWith('.partial')), false);
  } finally { await running?.close(); await rm(root, { recursive: true, force: true }); }
});

test('missing backup dependency preserves the complete previous bootstrap', async () => {
  const { root, source, options } = await bootstrapFixture();
  try {
    await activate(root, first);
    await writeFile(join(root, 'deployment/export-backup.sh'), 'previous backup');
    await rm(join(source, 'deployment/package-backup.py'));
    await assert.rejects(() => refreshBootstrap(root, first, options), { code: 'ENOENT' });
    assert.equal(await readFile(join(root, 'deployment/controller.mjs'), 'utf8'), 'export const version = "previous";\n');
    assert.equal(await readFile(join(root, 'deployment/update.sh'), 'utf8'), '#!/bin/sh\nprintf previous\n');
    assert.equal(await readFile(join(root, 'deployment/export-backup.sh'), 'utf8'), 'previous backup');
    assert.equal((await readdir(join(root, 'deployment'))).some(name => name.endsWith('.partial')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('inactive or invalid candidate bootstrap leaves both current files untouched', async () => {
  const { root, source, options } = await bootstrapFixture();
  try {
    await assert.rejects(() => refreshBootstrap(root, first, options), /successfully activated/);
    await activate(root, first);
    await writeFile(join(source, 'deployment/update.sh'), '#!/bin/sh\nif broken syntax\n');
    await assert.rejects(() => refreshBootstrap(root, first, options), /syntax validation failed/);
    assert.equal(await readFile(join(root, 'deployment/controller.mjs'), 'utf8'), 'export const version = "previous";\n');
    assert.equal(await readFile(join(root, 'deployment/update.sh'), 'utf8'), '#!/bin/sh\nprintf previous\n');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid encryption helper or oversized Python helper cannot partially refresh the bootstrap', async () => {
  const { root, source, options } = await bootstrapFixture();
  try {
    await activate(root, first);
    await writeFile(join(source, 'scripts/encrypt-backup.mjs'), 'export const broken = ;');
    await assert.rejects(() => refreshBootstrap(root, first, options), /syntax validation failed/);
    await writeFile(join(source, 'scripts/encrypt-backup.mjs'), 'export const valid = true;');
    await writeFile(join(source, 'deployment/package-backup.py'), Buffer.alloc(1024 * 1024 + 1));
    await assert.rejects(() => refreshBootstrap(root, first, options), /bounded regular source files/);
    assert.equal(await readFile(join(root, 'deployment/controller.mjs'), 'utf8'), 'export const version = "previous";\n');
    assert.equal(await readFile(join(root, 'deployment/update.sh'), 'utf8'), '#!/bin/sh\nprintf previous\n');
    assert.equal((await readdir(join(root, 'deployment'))).some(name => name.endsWith('.partial')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('updater lock contract uses kernel flock and preserves active legacy deployments', async () => {
  const script = await readFile(new URL('../update.sh', import.meta.url), 'utf8');
  const acquire = script.indexOf('flock -n 9');
  const legacyPid = script.indexOf('kill -0 "$task_legacy_pid"');
  const reclaim = script.indexOf('rm -f "$task_root/state/update.lock/pid"');
  const fetch = script.indexOf('helper bridge fetch');
  assert.ok(acquire > 0 && acquire < legacyPid && legacyPid < reclaim && reclaim < fetch);
  assert.match(script, /exec 9> "\$task_root\/state\/update\.flock"/);
  assert.doesNotMatch(script, /rm[^\n]*update\.flock/);
  assert.match(script, /sudo -n "\$task_docker" "\$@"/);
  assert.match(script, /--user "\$task_uid:\$task_gid"/);
  assert.match(script, /import-portable\.js \/import \/var\/lib\/war-archive \/var\/lib\/war-archive-releases\r?\n/);
  assert.ok(script.indexOf('task_done=true\n# The current shell') < script.indexOf('helper none refresh-bootstrap'));
});
