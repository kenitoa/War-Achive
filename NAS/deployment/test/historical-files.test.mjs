import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, access, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { installHistory } from '../install-historical-files.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'archive-history-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = resolve(root, 'source'), data = resolve(root, 'data'), releases = resolve(root, 'releases');
  for (const path of [source, data, releases]) await mkdir(path);
  const bytes = Buffer.from('preserved historical description');
  const snapshot = { releaseId: 'rel-fixture', records: [] }, sha256 = hash(JSON.stringify(snapshot));
  const contents = {
    ['data/derivatives/regenerate/' + hash(bytes)]: bytes,
    'releases/rel-fixture/archive.json': Buffer.from(JSON.stringify(snapshot, null, 2)),
    'releases/rel-fixture/manifest.json': Buffer.from(JSON.stringify({ sha256, recordCount: 0 })),
  };
  const files = [];
  for (const [path, value] of Object.entries(contents)) { await mkdir(resolve(source, path, '..'), { recursive: true }); await writeFile(resolve(source, path), value); files.push({ path, sha256: hash(value), sizeBytes: value.length }); }
  const manifest = { format: 'war-archive-historical-files', version: 1, files, publications: [{ id: 'rel-fixture', sha256, recordCount: 0 }] };
  const save = () => writeFile(resolve(source, 'manifest.json'), JSON.stringify(manifest));
  await save();
  return { root, source, data, releases, manifest, save };
}
test('dry run writes nothing, apply preserves exact historical bytes and repeating is a no-op', async t => {
  const f = await fixture(t);
  assert.equal((await installHistory(f.source, f.data, f.releases)).filesToAdd, 3);
  await assert.rejects(access(resolve(f.data, 'derivatives')));
  assert.deepEqual(await installHistory(f.source, f.data, f.releases, true), { status: 'repaired', filesVerified: 3, filesAdded: 3, filesToAdd: 3, existingFilesPreserved: 0, releasesVerified: 1, databaseModified: false });
  const repeated = await installHistory(f.source, f.data, f.releases, true);
  assert.equal(repeated.filesAdded, 0); assert.equal(repeated.existingFilesPreserved, 3);
  assert.deepEqual(await readFile(resolve(f.releases, 'rel-fixture/archive.json')), await readFile(resolve(f.source, 'releases/rel-fixture/archive.json')));
});
test('a conflicting existing target aborts before any missing files are added', async t => {
  const f = await fixture(t);
  await mkdir(resolve(f.releases, 'rel-fixture'));
  await writeFile(resolve(f.releases, 'rel-fixture/archive.json'), 'keep-existing-bytes');
  await assert.rejects(installHistory(f.source, f.data, f.releases, true), /HISTORY_TARGET_CONFLICT/);
  await assert.rejects(access(resolve(f.data, 'derivatives')));
  assert.equal(await readFile(resolve(f.releases, 'rel-fixture/archive.json'), 'utf8'), 'keep-existing-bytes');
});
test('source checksum changes, duplicate paths and traversal are rejected', async t => {
  const f = await fixture(t);
  await writeFile(resolve(f.source, f.manifest.files[0].path), 'corrupt');
  await assert.rejects(installHistory(f.source, f.data, f.releases, true), /HISTORY_SOURCE_INTEGRITY/);
  f.manifest.files.push(f.manifest.files[0]); await f.save();
  await assert.rejects(installHistory(f.source, f.data, f.releases, true), /INVALID_HISTORY_FILE/);
  f.manifest.files.pop(); f.manifest.files[0].path = '../escape'; await f.save();
  await assert.rejects(installHistory(f.source, f.data, f.releases, true), /INVALID_HISTORY_FILE/);
});
test('a release with matching file bytes but a different expected snapshot hash is rejected', async t => {
  const f = await fixture(t); f.manifest.publications[0].sha256 = '0'.repeat(64); await f.save();
  await assert.rejects(installHistory(f.source, f.data, f.releases, true), /HISTORY_RELEASE_INTEGRITY/);
  await assert.rejects(access(resolve(f.data, 'derivatives')));
});
test('a symlink or junction in a target parent cannot redirect volume writes', async t => {
  const f = await fixture(t), outside = resolve(f.root, 'outside'); await mkdir(outside);
  await symlink(outside, resolve(f.data, 'derivatives'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(installHistory(f.source, f.data, f.releases, true), /UNSAFE_HISTORY_PATH/);
  await assert.rejects(access(resolve(outside, 'regenerate')));
});
