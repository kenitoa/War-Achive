import { afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,readFile,rm,appendFile,access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArchiveService,type ArchiveService } from '../src/application/archive-service.js';
import { exportPortable,importPortable,verifyPortable } from '../src/infrastructure/portable.js';
import { spawn } from 'node:child_process';

const services:ArchiveService[]=[],roots:string[]=[];
afterEach(async()=>{for(const service of services.splice(0))await service.close();for(const root of roots.splice(0))await rm(root,{force:true,recursive:true,maxRetries:10,retryDelay:100});});
describe('portable logical archive migration',()=>{
it('roundtrips IDs, checkpoints, original files, identity shelves and withdrawals into a fresh migrated database; rejects overwrite and tamper',async()=>{
  const root=await mkdtemp(join(tmpdir(),'archive-portable-'));roots.push(root);
  const source=await createArchiveService({dataDir:join(root,'source-data'),exportDir:join(root,'source-release'),autoPublish:false,skipDnsCheckForTests:true,fetcher:async()=>Response.json({query:{pages:Object.fromEntries([12,13].map(id=>[id,{pageid:id,title:`File:Archive ${id}.jpg`,imageinfo:[{descriptionurl:`https://commons.wikimedia.org/wiki/File:Archive_${id}.jpg`,extmetadata:{ImageDescription:{value:`Original source ${id}`},DateTimeOriginal:{value:'1951'}}}]}]))}})});services.push(source);
  const registry=await source.createSource({name:'Portable source',provider:'commons',query:'Korean War',policy:{status:'approved',allowAutoPublish:true,metadataOnly:true,rightsLabel:'Metadata links only'}},'test-reviewer');await source.collectSource(registry.id);for(let i=0;i<10;i++)if(!await source.runNextJob())break;
  const records=await source.listRecords(),first=records[0]!,second=records[1]!;
  const letter=Buffer.from('An uploaded original letter preserved by logical migration.');
  await source.uploadOriginal(first.id,{data:letter.toString('base64'),mimeType:'text/plain',filename:'letter.txt',rightsAttestation:'The contributor authorizes private preservation and processing of this original.',publishDerivatives:false});for(let i=0;i<10;i++)if(!await source.runNextJob())break;
  await source.withdrawRecord(second.id,'Preserve withdrawal across migration');for(let i=0;i<10;i++)if(!await source.runNextJob())break;
  const catalog=await source.getSource(registry.id);catalog.checkpoint={...catalog.checkpoint,backfillPage:4,refreshOffset:1};await source.db.query('UPDATE sources SET data=$2 WHERE id=$1',[registry.id,JSON.stringify(catalog)]);
  await source.db.query('INSERT INTO members(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',['member-migration','migration@example.test','Migration member','salted-password-hash-fixture']);await source.db.query('INSERT INTO member_shelves(member_id,revision,document) VALUES($1,$2,$3)',['member-migration',3,JSON.stringify({savedIds:[first.id]})]);await source.db.query("INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",['a'.repeat(64),'member-migration']);await source.db.query("INSERT INTO member_reset_tokens(token_hash,member_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",['b'.repeat(64),'member-migration']);
  await source.collectSource(registry.id);const leased=await source.claimJob();expect(leased?.state).toBe('running');
  const bundle=join(root,'portable');const manifest=await exportPortable(source.db,source.options.dataDir,bundle);expect(manifest.originals).toHaveLength(3);expect(manifest.tables.some(t=>String(t.name)==='member_sessions')).toBe(false);expect((await verifyPortable(bundle)).migrations).toHaveLength(6);
  const target=await createArchiveService({dataDir:join(root,'target-data'),exportDir:join(root,'target-release'),autoPublish:false});services.push(target);
  const result=await importPortable(target.db,bundle,target.options.dataDir);expect(result).toMatchObject({records:2,sources:1,originals:3,invalidatedSessions:true});
  expect((await target.getSource(registry.id)).checkpoint).toEqual(catalog.checkpoint);expect((await target.listRecords()).map(r=>r.id).sort()).toEqual(records.map(r=>r.id).sort());expect((await target.getRecord(second.id)).status).toBe('withdrawn');expect((await target.buildSnapshot()).records.some(r=>r.id===second.id)).toBe(false);
  const raw=(await target.db.query('SELECT file_path,ingest_sequence FROM raw_items ORDER BY ingest_sequence')).rows;expect(raw.map(r=>Number(r.ingest_sequence))).toEqual([1,2]);for(const row of raw){expect(String(row.file_path)).toContain('target-data');expect(await readFile(String(row.file_path),'utf8')).toContain('Original source');}expect(Number((await target.db.query("SELECT nextval(pg_get_serial_sequence('raw_items','ingest_sequence')) AS n")).rows[0]?.n)).toBe(3);
  const media=(await target.listAssets(first.id))[0]!;expect(media.filePath).toContain('target-data');expect(await readFile(media.filePath)).toEqual(letter);expect(media.production).toBeNull();expect((await target.listJobs()).some(job=>job.kind==='produce'&&job.state==='queued')).toBe(true);const requeued=(await target.listJobs()).find(job=>job.id===leased?.id)!;expect(requeued.state).toBe('queued');expect(requeued.leaseUntil).toBeNull();expect(requeued.attempts).toBe(0);
  expect((await target.db.query('SELECT count(*)::integer AS n FROM member_sessions')).rows[0]?.n).toBe(0);expect((await target.db.query('SELECT count(*)::integer AS n FROM member_reset_tokens')).rows[0]?.n).toBe(0);expect((await target.db.query('SELECT revision,document FROM member_shelves WHERE member_id=$1',['member-migration'])).rows[0]).toEqual({revision:3,document:{savedIds:[first.id]}});
  await expect(importPortable(target.db,bundle,target.options.dataDir)).rejects.toThrow('비어 있지');
  const untouched=join(root,'would-overwrite');await expect(importPortable(target.db,bundle,untouched)).rejects.toThrow('새 빈 DB');await expect(access(untouched)).rejects.toThrow();
  const cliData=join(root,'cli-target');
  const command=await new Promise<{code:number|null;output:string}>((done,fail)=>{const child=spawn(process.execPath,['--import','tsx','src/commands/import-portable.ts',bundle,cliData],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'test',WAR_ARCHIVE_ADMIN_TOKEN:'portable-test-token-with-32-characters',DATABASE_URL:'',PGLITE_PATH:'',DATA_DIR:source.options.dataDir},windowsHide:true});let output='';child.stdout.on('data',(chunk:Buffer)=>{output+=chunk.toString();});child.stderr.on('data',(chunk:Buffer)=>{output+=chunk.toString();});child.once('error',fail);child.once('exit',code=>done({code,output}));});
  expect(command.code,command.output).toBe(0);expect(command.output).toContain('portable.import');await expect(access(join(source.options.dataDir,'database'))).rejects.toThrow();
  const cliTarget=await createArchiveService({pglitePath:join(cliData,'database'),dataDir:cliData,exportDir:join(root,'cli-release'),autoPublish:false});services.push(cliTarget);expect(await cliTarget.listRecords()).toHaveLength(2);
  await appendFile(join(bundle,'records.jsonl'),'{}\n');await expect(verifyPortable(bundle)).rejects.toThrow('변조');
});
});
