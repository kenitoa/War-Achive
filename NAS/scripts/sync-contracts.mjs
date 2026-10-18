import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const contract = await readFile(resolve(root, 'NAS/back/src/domain/contracts.ts'), 'utf8');
const models = await readFile(resolve(root, 'NAS/back/src/domain/models.ts'), 'utf8');
const outputs = [
  ['Vercel/lib/generated-contract.ts', contract],
  ['NAS/admin/src/generated-contract.ts', contract],
  ['NAS/admin/src/generated-models.ts', models.replaceAll("'./contracts.js'", "'./generated-contract.js'")],
];
for (const [relative, body] of outputs) {
  const target = resolve(root, relative);
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8').catch(() => '') !== body) throw new Error(`Contract is out of date: ${relative}`);
  } else { await mkdir(dirname(target), { recursive: true }); await writeFile(target, body); }
}
console.log(process.argv.includes('--check') ? 'Public and admin contracts match the canonical NAS source.' : 'Public and admin contracts synchronized.');
