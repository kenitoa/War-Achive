import { mkdir, readFile, writeFile, rename, stat,open,link,unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';

export const sha256 = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex');
export function within(directory: string, ...parts: string[]): string { const base = resolve(directory), path = resolve(base, ...parts); if (path !== base && !path.startsWith(base + sep)) throw new Error('File path escaped storage root'); return path; }
export async function preserveJson(root: string, value: unknown): Promise<{ hash: string; filePath: string }> {
  const content = JSON.stringify(value), hash = sha256(content); const filePath = within(root, 'originals', hash.slice(0, 2), `${hash}.json`);
  await preserveBytes(filePath,Buffer.from(content),hash);
  return { hash, filePath };
}
export async function preserveBytes(filePath:string,content:Buffer,expectedHash=sha256(content)):Promise<void>{
  if(sha256(content)!==expectedHash)throw new Error('Original integrity mismatch');
  await mkdir(resolve(filePath,'..'),{recursive:true,mode:0o700});
  const temporary=`${filePath}.${randomUUID()}.partial`;let created=false;
  try{const file=await open(temporary,'wx',0o600);created=true;try{await file.writeFile(content);await file.sync();}finally{await file.close();}
    try{await link(temporary,filePath);}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='EEXIST'))throw error;if(sha256(await readFile(filePath))!==expectedHash)throw new Error('Original integrity mismatch');}
  }finally{if(created)await unlink(temporary);}
}
export async function atomicJson(path: string, value: unknown): Promise<void> { await mkdir(resolve(path, '..'), { recursive: true }); const temp = `${path}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 }); await rename(temp, path); }
export async function availableStorage(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
