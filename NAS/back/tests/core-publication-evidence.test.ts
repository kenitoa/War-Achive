import { afterEach,describe,expect,it,vi } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArchiveService,type ArchiveService } from '../src/application/archive-service.js';
import { sha256 } from '../src/infrastructure/files.js';
vi.mock('node:dns/promises',()=>({lookup:async()=>[{address:'8.8.8.8',family:4}]}));
let service:ArchiveService|undefined,root:string|undefined;
afterEach(async()=>{await service?.close();if(root)await rm(root,{force:true,recursive:true,maxRetries:10,retryDelay:100});service=undefined;root=undefined;});
describe('live publication verification evidence',()=>{
it('promotes prepared releases, preserves upload evidence, and safely repairs published rows only with matching live hashes',async()=>{
  root=await mkdtemp(join(tmpdir(),'archive-live-evidence-'));let liveId='',liveHash='',fetchCount=0;
  service=await createArchiveService({dataDir:join(root,'data'),exportDir:join(root,'releases'),github:{repository:'owner/archive',token:'test-only-token',ref:'main',contentPath:'Vercel/content/archive.json',deploymentUrl:'https://archive.example.test/release.json'},fetcher:async()=>{fetchCount++;return Response.json({schemaVersion:1,releaseId:liveId,sha256:liveHash});}});
  const snapshot=await service.buildSnapshot('rel-proof'),hash=sha256(JSON.stringify(snapshot));
  const manifest={sha256:hash,recordCount:0,evidence:{uploaded:true,verified:false,commit:'preserved-commit'},additional:'keep-existing-field'};
  await service.db.query("INSERT INTO publications(id,target,status,record_count,manifest,snapshot) VALUES($1,'github','prepared',0,$2,$3)",[snapshot.releaseId,JSON.stringify(manifest),JSON.stringify(snapshot)]);
  liveId=snapshot.releaseId;liveHash='0'.repeat(64);expect(await service.verifyPendingPublications()).toBe(0);expect((await service.listPublications())[0]?.status).toBe('prepared');
  liveHash=hash;expect(await service.verifyPendingPublications()).toBe(1);const published=(await service.listPublications())[0]!;expect(published.status).toBe('published');expect(published.manifest).toMatchObject({...manifest,evidence:{uploaded:true,verified:true,commit:'preserved-commit'}});const proof=(published.manifest as {evidence:{liveVerifiedAt:string}}).evidence.liveVerifiedAt;expect(Number.isNaN(Date.parse(proof))).toBe(false);
  const requestsAfterVerified=fetchCount;expect(await service.verifyPendingPublications()).toBe(0);expect(fetchCount).toBe(requestsAfterVerified);
  const firstPublishedAt=published.publishedAt;
  await service.db.query('UPDATE publications SET manifest=$2 WHERE id=$1',[snapshot.releaseId,JSON.stringify(manifest)]);
  liveHash='f'.repeat(64);expect(await service.verifyPendingPublications()).toBe(0);expect(((await service.listPublications())[0]?.manifest as {evidence:{verified:boolean}}).evidence.verified).toBe(false);
  liveHash=hash;expect(await service.verifyPendingPublications()).toBe(1);const repaired=(await service.listPublications())[0]!;expect(repaired.publishedAt).toEqual(firstPublishedAt);expect(repaired.manifest).toMatchObject({additional:'keep-existing-field',evidence:{uploaded:true,verified:true,commit:'preserved-commit',liveVerifiedAt:expect.any(String)}});
});
});
