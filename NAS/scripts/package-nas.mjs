import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(source, 'artifacts', `nas-package-${randomUUID()}`);
const stage = resolve(target, 'source', 'NAS');
const skip = new Set(['node_modules', '.next', 'out', 'dist', 'coverage', '.git', '.vercel', 'data', 'releases', 'backups', 'artifacts', '__pycache__', '.pytest_cache']);
const inventory = [];
await mkdir(stage, { recursive: true });
async function copyTree(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (skip.has(entry.name) || (entry.name.startsWith('.env') && entry.name !== '.env.example') || entry.name.endsWith('.log') || entry.name.endsWith('.tsbuildinfo') || /\.py[cod]$/.test(entry.name)) continue;
    const input = resolve(path, entry.name), name = relative(source, input), output = resolve(stage, name);
    if (entry.isSymbolicLink() || (await lstat(input)).isSymbolicLink()) throw new Error('Symbolic links are excluded from NAS delivery');
    if (entry.isDirectory()) { await mkdir(output, { recursive: true }); await copyTree(input); }
    else if (entry.isFile()) { await copyFile(input, output); inventory.push({ path: name.replaceAll('\\', '/'), sha256: createHash('sha256').update(await readFile(output)).digest('hex') }); }
    else throw new Error('Only regular source files are allowed in a delivery');
  }
}
await copyTree(source);
await writeFile(resolve(stage, 'delivery-manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), excludes: ['secrets', 'database', 'originals', 'portable bundle', 'build output'], files: inventory }, null, 2) + '\n');
const archive = resolve(target, 'war-archive-nas-source.tar.gz');
await run('tar', ['-czf', archive, '-C', resolve(target, 'source'), 'NAS']);
const digest = createHash('sha256');
for await (const chunk of createReadStream(archive)) digest.update(chunk);
const sha256 = digest.digest('hex');
await writeFile(resolve(target, 'SHA256SUMS'), `${sha256}  war-archive-nas-source.tar.gz\n`);
console.log(JSON.stringify({ archive, sha256, sourceFiles: inventory.length, privateEnvironmentIncluded: false, portableDataIncluded: false }));
