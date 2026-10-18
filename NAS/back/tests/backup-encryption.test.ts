import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const script = fileURLToPath(new URL('../../scripts/encrypt-backup.mjs', import.meta.url));

describe('encrypted offsite backup', () => {
  it('roundtrips with authentication, refuses overwrite and leaves no plaintext on wrong keys', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'war-backup-'));
    try {
      const input = resolve(directory, 'input.dump'), encrypted = resolve(directory, 'backup.enc'), output = resolve(directory, 'restored.dump');
      const payload = Buffer.concat([Buffer.from('private archive metadata'), randomBytes(50000)]);
      await writeFile(input, payload);
      const env = { ...process.env, BACKUP_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
      await run(process.execPath, [script, 'encrypt', input, encrypted], { env });
      expect((await readFile(encrypted)).includes(Buffer.from('private archive metadata'))).toBe(false);
      await run(process.execPath, [script, 'decrypt', encrypted, output], { env });
      expect(await readFile(output)).toEqual(payload);
      await expect(run(process.execPath, [script, 'decrypt', encrypted, output], { env })).rejects.toThrow();
      const wrongOutput = resolve(directory, 'wrong.dump');
      await expect(run(process.execPath, [script, 'decrypt', encrypted, wrongOutput], { env: { ...env, BACKUP_ENCRYPTION_KEY: randomBytes(32).toString('base64') } })).rejects.toThrow();
      expect(await readdir(directory)).not.toContain('wrong.dump');
      expect((await readdir(directory)).some((entry) => entry.endsWith('.partial'))).toBe(false);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
