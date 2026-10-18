// Runs without network access as the archive's existing UID against only its own
// data/release volumes. It never opens the database or replaces an existing file.
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, open, link, unlink } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = value => createHash('sha256').update(value).digest('hex');
const allowed = /^(?:data\/derivatives\/regenerate\/[a-f0-9]{64}|releases\/rel-[a-zA-Z0-9-]+\/(?:archive|manifest)\.json)$/;
function inventory(value) {
  if (!value || value.format !== 'war-archive-historical-files' || value.version !== 1 || !Array.isArray(value.files) || !Array.isArray(value.publications) || value.files.length > 10000) throw new Error('INVALID_HISTORY_MANIFEST');
  const paths = new Set();
  for (const file of value.files) {
    if (!file || !allowed.test(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > 64 * 1024 * 1024 || paths.has(file.path)) throw new Error('INVALID_HISTORY_FILE');
    if (file.path.startsWith('data/') && !file.path.endsWith('/' + file.sha256)) throw new Error('INVALID_CONTENT_ADDRESS');
    paths.add(file.path);
  }
  const releases = new Set();
  for (const publication of value.publications) {
    if (!publication || !/^rel-[a-zA-Z0-9-]+$/.test(publication.id) || !/^[a-f0-9]{64}$/.test(publication.sha256) || !Number.isSafeInteger(publication.recordCount) || publication.recordCount < 0 || releases.has(publication.id)) throw new Error('INVALID_HISTORY_RELEASE');
    for (const name of ['archive.json', 'manifest.json']) if (!paths.has(`releases/${publication.id}/${name}`)) throw new Error('INCOMPLETE_HISTORY_RELEASE');
    releases.add(publication.id);
  }
  for (const path of paths) if (path.startsWith('releases/') && !releases.has(path.split('/')[1])) throw new Error('UNLISTED_HISTORY_RELEASE');
  return value;
}
async function ordinaryFile(root, path) {
  const entry = await lstat(path);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('UNSAFE_HISTORY_PATH');
  const actual = await realpath(path);
  if (!actual.startsWith(root + sep)) throw new Error('UNSAFE_HISTORY_PATH');
  return actual;
}
async function parent(root, suffix, create) {
  const parts = suffix.split('/');
  let path = root;
  for (const part of parts.slice(0, -1)) {
    path = resolve(path, part);
    try { if (create) await mkdir(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    try {
      const entry = await lstat(path);
      if (!entry.isDirectory() || entry.isSymbolicLink() || !(await realpath(path)).startsWith(root + sep)) throw new Error('UNSAFE_HISTORY_PATH');
    } catch (error) { if (!create && error.code === 'ENOENT') return; throw error; }
  }
}
export async function installHistory(bundle, dataRoot, releasesRoot, apply = false) {
  const source = await realpath(bundle), roots = { data: await realpath(dataRoot), releases: await realpath(releasesRoot) };
  const manifest = inventory(JSON.parse(await readFile(await ordinaryFile(source, resolve(source, 'manifest.json')), 'utf8')));
  const pending = [];
  let existing = 0;
  for (const file of manifest.files) {
    const path = await ordinaryFile(source, resolve(source, file.path));
    const bytes = await readFile(path);
    if (bytes.length !== file.sizeBytes || digest(bytes) !== file.sha256) throw new Error('HISTORY_SOURCE_INTEGRITY');
    const [kind, ...parts] = file.path.split('/'), suffix = parts.join('/'), root = roots[kind], destination = resolve(root, suffix);
    await parent(root, suffix, false);
    try {
      const actual = await ordinaryFile(root, destination);
      if (digest(await readFile(actual)) !== file.sha256) throw new Error('HISTORY_TARGET_CONFLICT');
      existing++;
    } catch (error) { if (error.code !== 'ENOENT') throw error; pending.push({ ...file, bytes, root, suffix, destination }); }
  }
  for (const publication of manifest.publications) {
    const archive = JSON.parse(await readFile(resolve(source, 'releases', publication.id, 'archive.json'), 'utf8'));
    const release = JSON.parse(await readFile(resolve(source, 'releases', publication.id, 'manifest.json'), 'utf8'));
    if (digest(JSON.stringify(archive)) !== publication.sha256 || release.sha256 !== publication.sha256 || archive.releaseId !== publication.id || archive.records?.length !== publication.recordCount || release.recordCount !== publication.recordCount) throw new Error('HISTORY_RELEASE_INTEGRITY');
  }
  if (apply) for (const file of pending) {
    await parent(file.root, file.suffix, true);
    const temporary = resolve(dirname(file.destination), '.' + randomUUID() + '.history-partial');
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(file.bytes); await handle.sync(); } finally { await handle.close(); }
    try {
      try { await link(temporary, file.destination); }
      catch (error) { if (error.code !== 'EEXIST') throw error; if (digest(await readFile(await ordinaryFile(file.root, file.destination))) !== file.sha256) throw new Error('HISTORY_TARGET_CONFLICT'); }
      if (digest(await readFile(await ordinaryFile(file.root, file.destination))) !== file.sha256) throw new Error('HISTORY_WRITE_INTEGRITY');
    } finally { await unlink(temporary); }
  }
  return { status: apply ? 'repaired' : 'planned', filesVerified: manifest.files.length, filesAdded: apply ? pending.length : 0, filesToAdd: pending.length, existingFilesPreserved: existing, releasesVerified: manifest.publications.length, databaseModified: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.getuid?.() !== 1000) throw new Error('ARCHIVE_UID_REQUIRED');
    console.log(JSON.stringify(await installHistory('/repair', '/var/lib/war-archive', '/var/lib/war-archive-releases', process.argv.includes('--apply'))));
  } catch (error) { console.error(JSON.stringify({ status: 'failed', code: /^[A-Z_]+$/.test(error.message) ? error.message : 'HISTORY_REPAIR_FAILED' })); process.exitCode = 1; }
}
