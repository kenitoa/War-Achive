import { createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

function run(command, args, input, timeout = 1_800_000) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [], errors = []; let bytes = 0; let errorBytes = 0;
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) child.kill(); else chunks.push(chunk); });
    // Child diagnostics can contain private server paths; report a bounded status only.
    child.stderr.on('data', chunk => { errorBytes += chunk.length; if (errorBytes > 1024 * 1024) child.kill(); else errors.push(chunk); });
    child.once('error', error => { clearTimeout(timer); fail(new Error(`${command} could not start (${error.code ?? 'UNKNOWN'})`)); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0 && bytes <= 1024 * 1024) done(Buffer.concat(chunks).toString('utf8'));
      else {
        let phase = '';
        for (const line of Buffer.concat(errors).toString('utf8').trim().split(/\r?\n/)) {
          try { const value = JSON.parse(line); if (value && value.operation === 'backup.export' && value.status === 'failed' && /^[a-z-]{1,40}$/.test(value.phase)) phase = `, phase ${value.phase}`; } catch (error) { if (error instanceof SyntaxError) continue; throw error; }
        }
        fail(new Error(`${command} failed (exit ${code ?? 'terminated'}${phase})`));
      }
    });
    child.stdin.on('error', () => {}); // A child can reject its input before the pipe is drained.
    child.stdin.end(input);
  });
}

export async function verifyCiphertext(file, key, expectedPlaintextSha256) {
  if (key.length !== 32 || !/^[a-f0-9]{64}$/.test(expectedPlaintextSha256)) throw new Error('Invalid backup verification inputs');
  const metadata = await stat(file);
  if (metadata.size < 32) throw new Error('Truncated encrypted backup');
  const handle = await open(file, 'r');
  const header = Buffer.alloc(16), tag = Buffer.alloc(16);
  try { await handle.read(header, 0, 16, 0); await handle.read(tag, 0, 16, metadata.size - 16); } finally { await handle.close(); }
  if (header.subarray(0, 4).toString() !== 'WAB1') throw new Error('Unknown encrypted backup format');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(4));
  decipher.setAuthTag(tag);
  const hash = createHash('sha256');
  await pipeline(createReadStream(file, { start: 16, end: metadata.size - 17 }), decipher, new Writable({ write(chunk, encoding, callback) { hash.update(chunk); callback(); } }));
  const digest = hash.digest('hex');
  if (digest !== expectedPlaintextSha256) throw new Error('Backup decrypted successfully but its plaintext checksum differs');
  return digest;
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function validateConfig(config) {
  if (!config || config.version !== 1 || !/^[a-zA-Z0-9.-]+$/.test(config.host) || !/^[a-zA-Z0-9_-]+$/.test(config.user)) throw new Error('Invalid SSH backup configuration');
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(config.remoteRoot) || config.remoteRoot === '/' || config.remoteRoot.split('/').includes('..')) throw new Error('Invalid dedicated NAS root');
  for (const name of ['destination', 'identityFile', 'knownHostsFile', 'keyFile']) if (typeof config[name] !== 'string' || !isAbsolute(config[name])) throw new Error(`An absolute ${name} path is required`);
  return config;
}

function sshArguments(config) {
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${config.knownHostsFile}`, '-i', config.identityFile];
}

async function dpapiKey(config) {
  if (process.platform !== 'win32') throw new Error('This backup client requires Windows DPAPI for key protection');
  const protectedValue = await readFile(config.keyFile, 'utf8');
  const source = "$ErrorActionPreference='Stop';$s=ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim());$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}";
  const value = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', source], protectedValue, 30_000)).trim();
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('The protected backup key is invalid');
  return key;
}

export async function backup(config) {
  validateConfig(config);
  await mkdir(config.destination, { recursive: true });
  const key = await dpapiKey(config);
  try {
    const response = await run('ssh', [...sshArguments(config), `${config.user}@${config.host}`, `sh '${config.remoteRoot}/deployment/export-backup.sh' '${config.remoteRoot}'`], `${key.toString('base64')}\n`);
    const ready = JSON.parse(response.trim().split(/\r?\n/).at(-1));
    if (ready.version !== 1 || ready.status !== 'encrypted-verified' || !/^\d{8}T\d{6}Z-[a-f0-9-]{36}$/.test(ready.id) || !/^[a-f0-9]{40}$/.test(ready.commit) || !/^[a-f0-9]{64}$/.test(ready.ciphertextSha256) || !/^[a-f0-9]{64}$/.test(ready.plaintextSha256) || ready.remoteFile !== `${config.remoteRoot}/backups/dr-${ready.id}.tar.gz.enc` || !Number.isSafeInteger(ready.bytes) || ready.bytes <= 32) throw new Error('Invalid remote backup receipt');
    const target = resolve(config.destination, basename(ready.remoteFile)), partial = `${target}.partial`;
    try { await stat(target); throw new Error('Backup target already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await stat(partial); throw new Error('An incomplete download requires inspection'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await run('scp', ['-O', '-q', ...sshArguments(config), `${config.user}@${config.host}:${ready.remoteFile}`, partial], undefined);
    if ((await stat(partial)).size !== ready.bytes || await sha256(partial) !== ready.ciphertextSha256) throw new Error('External backup download integrity failed');
    await verifyCiphertext(partial, key, ready.plaintextSha256);
    await rename(partial, target);
    const receipt = { ...ready, remoteFile: undefined, status: 'external-authenticated', verifiedAt: new Date().toISOString(), file: basename(target), destinationType: 'windows-pc' };
    await writeFile(`${target}.receipt.json`, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await writeFile(resolve(config.destination, 'latest.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ operation: 'backup.external', status: receipt.status, id: ready.id, commit: ready.commit, bytes: ready.bytes, verifiedAt: receipt.verifiedAt }));
    return receipt;
  } finally { key.fill(0); }
}

async function initialize(configPath, draft) {
  validateConfig(draft);
  const directory = dirname(configPath);
  await mkdir(directory, { recursive: true });
  try { await stat(configPath); throw new Error('Backup configuration already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const key = randomBytes(32);
  try {
    const source = "$ErrorActionPreference='Stop';$s=ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim()) -AsPlainText -Force;[Console]::Write((ConvertFrom-SecureString $s))";
    const protectedValue = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', source], key.toString('base64'), 30_000);
    await writeFile(draft.keyFile, protectedValue, { flag: 'wx', mode: 0o600 });
    await writeFile(configPath, JSON.stringify(draft, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } finally { key.fill(0); }
  console.log(JSON.stringify({ operation: 'backup.initialize', status: 'configured', keyProtection: 'Windows-DPAPI-CurrentUser' }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, configPath, draftPath] = process.argv.slice(2);
    if (!configPath) throw new Error('Usage: external-backup-client.mjs init|backup|verify config.json [draft.json]');
    if (mode === 'init') await initialize(configPath, JSON.parse(await readFile(draftPath, 'utf8')));
    else if (mode === 'backup' || mode === 'backup-if-due') {
      const config = validateConfig(JSON.parse(await readFile(configPath, 'utf8')));
      let due = true;
      if (mode === 'backup-if-due') {
        try {
          const receipt = JSON.parse(await readFile(resolve(config.destination, 'latest.json'), 'utf8'));
          if (receipt.status === 'external-authenticated' && /^dr-\d{8}T\d{6}Z-[a-f0-9-]{36}\.tar\.gz\.enc$/.test(receipt.file) && Date.now() - Date.parse(receipt.verifiedAt) < 20 * 3600_000 && Date.now() >= Date.parse(receipt.verifiedAt)) {
            await stat(resolve(config.destination, receipt.file));
            due = false;
          }
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      if (due) await backup(config);
      else console.log(JSON.stringify({ operation: 'backup.external', status: 'recent-verified-copy-present' }));
    }
    else if (mode === 'verify' || mode === 'return-for-rehearsal') {
      const config = validateConfig(JSON.parse(await readFile(configPath, 'utf8')));
      const receipt = JSON.parse(await readFile(resolve(config.destination, 'latest.json'), 'utf8'));
      if (!/^dr-\d{8}T\d{6}Z-[a-f0-9-]{36}\.tar\.gz\.enc$/.test(receipt.file)) throw new Error('Invalid local backup receipt');
      const file = resolve(config.destination, receipt.file), key = await dpapiKey(config);
      try {
        if (await sha256(file) !== receipt.ciphertextSha256) throw new Error('Ciphertext checksum differs');
        await verifyCiphertext(file, key, receipt.plaintextSha256);
        if (mode === 'return-for-rehearsal') {
          if (!/^[a-f0-9]{40}$/.test(receipt.commit)) throw new Error('Invalid backup commit');
          const directory = `${config.remoteRoot}/artifacts/external-retrieval-${randomUUID()}`;
          await run('ssh', [...sshArguments(config), `${config.user}@${config.host}`, `umask 077; mkdir '${directory}'`]);
          await run('scp', ['-O', '-q', ...sshArguments(config), file, `${config.user}@${config.host}:${directory}/external.tar.gz.enc`]);
          const response = await run('ssh', [...sshArguments(config), `${config.user}@${config.host}`, `python3 '${config.remoteRoot}/deployment/prepare-backup-rehearsal.py' '${config.remoteRoot}' '${directory}' '${receipt.commit}'`], `${key.toString('base64')}\n`);
          console.log(response.trim());
        } else console.log(JSON.stringify({ operation: 'backup.verify', status: 'external-authenticated', id: receipt.id, commit: receipt.commit }));
      } finally { key.fill(0); }
    } else throw new Error('Unknown backup operation');
  } catch (error) { console.error(JSON.stringify({ operation: 'backup.external', status: 'failed', message: error.message })); process.exitCode = 1; }
}
