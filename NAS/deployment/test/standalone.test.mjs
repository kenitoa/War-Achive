import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify, parseEnv } from 'node:util';
const run=promisify(execFile),nas=resolve(dirname(fileURLToPath(import.meta.url)),'../..');

test('standalone NAS configuration generates strong secrets and preserves existing credentials and pipeline choices',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'nas-standalone-'));
  try{
    const target=resolve(root,'NAS'),script=resolve(target,'scripts/configure-nas.mjs');await mkdir(dirname(script),{recursive:true});await copyFile(resolve(nas,'scripts/configure-nas.mjs'),script);
    const first=await run(process.execPath,[script,'--production']);const envPath=resolve(target,'.env'),initial=parseEnv(await readFile(envPath,'utf8'));
    assert.ok(initial.WAR_ARCHIVE_ADMIN_TOKEN.length>=32);assert.ok(initial.POSTGRES_PASSWORD.length>=32);assert.equal(initial.EDITORIAL_PIPELINE_ENABLED,'true');assert.equal(initial.REMOTE_PUBLISH_ENABLED,'false');assert.equal(initial.PUBLIC_PORT,'9232');assert.ok(!first.stdout.includes(initial.WAR_ARCHIVE_ADMIN_TOKEN));
    await writeFile(envPath,(await readFile(envPath,'utf8')).replace('EDITORIAL_PIPELINE_ENABLED=true','EDITORIAL_PIPELINE_ENABLED=false'));
    await run(process.execPath,[script,'--production']);const repeated=parseEnv(await readFile(envPath,'utf8'));assert.equal(repeated.WAR_ARCHIVE_ADMIN_TOKEN,initial.WAR_ARCHIVE_ADMIN_TOKEN);assert.equal(repeated.POSTGRES_PASSWORD,initial.POSTGRES_PASSWORD);assert.equal(repeated.EDITORIAL_PIPELINE_ENABLED,'false');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('NAS contracts can be verified after copying only the NAS folder without a Vercel sibling',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'nas-contract-package-'));
  try{
    const files=['scripts/sync-contracts.mjs','back/src/domain/contracts.ts','back/src/domain/models.ts','back/src/domain/editorial-contract.ts','admin/src/generated-contract.ts','admin/src/generated-models.ts','admin/src/generated-editorial.ts'];
    for(const file of files){const target=resolve(root,'NAS',file);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(nas,file),target);}
    const result=await run(process.execPath,[resolve(root,'NAS/scripts/sync-contracts.mjs'),'--nas-only','--check']);assert.match(result.stdout,/match/);
  }finally{await rm(root,{recursive:true,force:true});}
});
