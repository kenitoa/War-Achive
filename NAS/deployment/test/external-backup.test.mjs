import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCiphertext } from '../external-backup-client.mjs';

const run = promisify(execFile);
const encryptScript = fileURLToPath(new URL('../../scripts/encrypt-backup.mjs', import.meta.url));
let directory, ciphertext, key, digest;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'war-external-backup-'));
  const input = join(directory, 'source.tar');
  ciphertext = join(directory, 'backup.enc');
  key = randomBytes(32);
  const payload = randomBytes(2 * 1024 * 1024 + 17);
  digest = createHash('sha256').update(payload).digest('hex');
  await writeFile(input, payload);
  await run(process.execPath, [encryptScript, 'encrypt', input, ciphertext], { env: { ...process.env, BACKUP_ENCRYPTION_KEY: key.toString('base64') } });
});
after(async () => { key?.fill(0); if (directory) await rm(directory, { recursive: true }); });

test('authenticates an external backup without writing decrypted data', async () => {
  const beforeFiles = await readdir(directory);
  assert.equal(await verifyCiphertext(ciphertext, key, digest), digest);
  assert.deepEqual(await readdir(directory), beforeFiles);
});
test('accepts a secret key through stdin without requiring a key in arguments or the environment', async () => {
  const target = join(directory, 'stdin-key.enc');
  await new Promise((done, fail) => {
    const child = execFile(process.execPath, [encryptScript, 'encrypt', join(directory, 'source.tar'), target, '--key-stdin'], { env: { ...process.env, BACKUP_ENCRYPTION_KEY: '' } }, error => error ? fail(error) : done());
    child.stdin.end(`${key.toString('base64')}\n`);
  });
  assert.equal(await verifyCiphertext(target, key, digest), digest);
});
test('rejects a ciphertext change despite its receipt checksum', async () => {
  const tampered = await readFile(ciphertext); tampered[100] ^= 1;
  const file = join(directory, 'tampered.enc'); await writeFile(file, tampered);
  await assert.rejects(verifyCiphertext(file, key, digest));
});
test('rejects a wrong key, truncated ciphertext and a mismatched plaintext receipt', async () => {
  await assert.rejects(verifyCiphertext(ciphertext, randomBytes(32), digest));
  await assert.rejects(verifyCiphertext(ciphertext, key, '0'.repeat(64)), /checksum differs/);
  const short = join(directory, 'short.enc'); await writeFile(short, Buffer.from('WAB1'));
  await assert.rejects(verifyCiphertext(short, key, digest), /Truncated/);
});
test('rejects an unsupported file header and invalid verification inputs', async () => {
  const bytes = await readFile(ciphertext); bytes[0] = 0;
  const file = join(directory, 'unknown.enc'); await writeFile(file, bytes);
  await assert.rejects(verifyCiphertext(file, key, digest), /Unknown/);
  await assert.rejects(verifyCiphertext(ciphertext, Buffer.alloc(2), digest), /Invalid/);
  await assert.rejects(verifyCiphertext(ciphertext, key, '../receipt'), /Invalid/);
});
