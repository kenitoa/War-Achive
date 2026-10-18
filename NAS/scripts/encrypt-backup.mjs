import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, readFileSync } from 'node:fs';
import { stat, open, copyFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';

const [mode, input, output, keyInput] = process.argv.slice(2);
if (!['encrypt', 'decrypt'].includes(mode) || !input || !output || resolve(input) === resolve(output)) throw new Error('Usage: encrypt-backup.mjs encrypt|decrypt input output. Key: BACKUP_ENCRYPTION_KEY (base64, 32 bytes).');
if (keyInput !== undefined && keyInput !== '--key-stdin') throw new Error('Unknown key input option.');
const keyValue = keyInput === '--key-stdin' ? readFileSync(0, 'utf8').trim() : process.env.BACKUP_ENCRYPTION_KEY ?? '';
if (!/^[A-Za-z0-9+/]{43}=$/.test(keyValue)) throw new Error('BACKUP_ENCRYPTION_KEY must contain a 32-byte base64 key.');
const key = Buffer.from(keyValue, 'base64');
if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must contain a 32-byte base64 key.');
if (mode === 'encrypt') {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const handle = await open(output, 'wx', 0o600);
  await handle.write(Buffer.concat([Buffer.from('WAB1'), iv]));
  await handle.close();
  await pipeline(createReadStream(input), cipher, createWriteStream(output, { flags: 'a', mode: 0o600 }));
  const tail = await open(output, 'a'); await tail.write(cipher.getAuthTag()); await tail.close();
} else {
  const size = (await stat(input)).size;
  if (size < 32) throw new Error('Invalid encrypted backup.');
  const file = await open(input, 'r'), header = Buffer.alloc(16), tag = Buffer.alloc(16);
  await file.read(header, 0, 16, 0); await file.read(tag, 0, 16, size - 16); await file.close();
  if (header.subarray(0, 4).toString() !== 'WAB1') throw new Error('Unknown backup format.');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(4)); decipher.setAuthTag(tag);
  const temporary = `${resolve(output)}.${randomUUID()}.partial`;
  try {
    await pipeline(createReadStream(input, { start: 16, end: size - 17 }), decipher, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    await copyFile(temporary, output, constants.COPYFILE_EXCL);
  } finally { await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
}
console.log(`${mode} completed. Verify a restored copy before use; keep the key outside this folder.`);
