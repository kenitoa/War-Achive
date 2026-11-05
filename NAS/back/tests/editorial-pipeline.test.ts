import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArchiveService, type ArchiveService } from '../src/application/archive-service.js';
import { EditorialService } from '../src/application/editorial-service.js';
import { analyseRecords, renderArticle, validateEvidence, type EditorialArticle } from '../src/domain/editorial.js';
import { buildApi } from '../src/presentation/api.js';
import { loadConfig } from '../src/config.js';
import { exportPortable, importPortable } from '../src/infrastructure/portable.js';

describe('NAS source to reviewed blog publication',()=>{
  let service:ArchiveService,root:string,recordId:string;
  beforeAll(async()=>{
    root=await mkdtemp(join(tmpdir(),'nas-editorial-'));
    service=await createArchiveService({pglitePath:join(root,'db'),dataDir:join(root,'data'),exportDir:join(root,'release'),autoPublish:false,skipDnsCheckForTests:true,fetcher:async()=>Response.json({query:{pages:{'12':{pageid:12,title:'File:Archive evidence.jpg',imageinfo:[{descriptionurl:'https://commons.wikimedia.org/wiki/File:Archive_evidence.jpg',extmetadata:{ImageDescription:{value:'Test archive description'},DateTimeOriginal:{value:'1951'},LicenseShortName:{value:'Public domain'}}}]}}}})});
    const source=await service.createSource({name:'Archive test',provider:'commons',query:'war archive',policy:{status:'approved',allowAutoPublish:true,metadataOnly:true,rightsLabel:'Metadata link only'}},'reviewer');
    await service.collectSource(source.id);await service.runNextJob();await service.runNextJob();await service.runNextJob();recordId=(await service.listRecords())[0]!.id;
  });
  afterAll(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
  const draft=async()=>{const item=await service.editorial.create({recordIds:[recordId]},'editor');expect(item).not.toBeNull();return item!;};
  const approve=(item:EditorialArticle,publishAt?:string)=>service.editorial.decide(item.id,{decision:'approve',expectedRevision:item.revision,contentReviewed:true,rightsReviewed:true,note:'Evidence and rights reviewed',...(publishAt?{publishAt}:{})},'publisher');

  it('analyses source metadata, preserves citations and does not invent a reviewed historical narrative',async()=>{
    const record=await service.getRecord(recordId),document=analyseRecords([record]);expect(document.analysis.method).toBe('catalogue-analysis-v1');expect(document.evidence[0]?.revision).toBe(record.public.revision);expect(document.approval).toBeUndefined();expect(validateEvidence(document)).toBe(true);
    expect(renderArticle({...document,title:'<script>alert(1)</script>'})).not.toContain('<script>');expect(renderArticle(document)).toContain('https://commons.wikimedia.org/');
    const longTitle=analyseRecords([{...record,public:{...record.public,title:'Long source title '.repeat(30)}}]);expect(longTitle.title.length).toBeLessThanOrEqual(240);expect(longTitle.evidence[0]?.title.length).toBeGreaterThan(240);
    await expect(service.editorial.create({recordIds:[recordId,recordId]})).rejects.toThrow();
  });
  it('automatically discovers new source revisions once, without automatic approval',async()=>{
    expect(await service.editorial.discover()).toBe(1);expect(await service.editorial.discover()).toBe(0);expect((await service.editorial.list()).items[0]?.status).toBe('review');
  });
  it('rejects unreviewed, unsourced and stale edits, then publishes an integrity-verified source-linked article',async()=>{
    let item=await draft();await expect(service.editorial.decide(item.id,{decision:'approve',expectedRevision:item.revision,note:'No review'},'publisher')).rejects.toThrow('검수');
    await expect(service.editorial.edit(item.id,{expectedRevision:99,title:'Conflict',summary:'Conflict',blocks:item.document.blocks},'editor')).rejects.toThrow('변경');
    await expect(service.editorial.edit(item.id,{expectedRevision:item.revision,title:'Invalid',summary:'Invalid',blocks:[{heading:'Unknown source',text:'Text',evidenceIds:['missing']}]},'editor')).rejects.toThrow('근거');
    item=await approve(item);expect(await service.editorial.publishNext()).toBe(true);expect((await service.editorial.get(item.id)).status).toBe('published');
    expect((await service.editorial.published(1,12,item.slug)).items).toHaveLength(1);
    const output=JSON.parse(await readFile(join(root,'release','blog',item.id,`r${item.revision}`,'article.json'),'utf8'));expect(output.document.evidence[0].recordId).toBe(recordId);
    expect(await service.editorial.publishNext()).toBe(false);expect((await service.db.query('SELECT * FROM blog_publications WHERE article_id=$1',[item.id])).rows).toHaveLength(1);
    const edited=await service.editorial.edit(item.id,{expectedRevision:item.revision,title:'Revised title',summary:item.document.summary,blocks:item.document.blocks},'editor');expect(edited.status).toBe('review');expect(edited.document.approval).toBeUndefined();expect((await service.editorial.published(1,12,item.slug)).total).toBe(0);
  });
  it('honours scheduled time, recovers an expired lease and remains idempotent across workers',async()=>{
    let item=await approve(await draft(),new Date(Date.now()+86400000).toISOString());expect(item.status).toBe('scheduled');expect(await service.editorial.publishNext()).toBe(false);
    await service.db.query("UPDATE editorial_articles SET run_at=now()-interval '1 minute',status='publishing',owner='crashed',lease_until=now()-interval '1 minute',attempts=1 WHERE id=$1",[item.id]);
    const other=new EditorialService(service.db,service.options.exportDir);await Promise.all([service.editorial.publishNext(),other.publishNext()]);item=await service.editorial.get(item.id);expect(item.status).toBe('published');expect((await service.db.query('SELECT * FROM blog_publications WHERE article_id=$1',[item.id])).rows).toHaveLength(1);
    await service.editorial.decide(item.id,{decision:'withdraw',expectedRevision:item.revision,note:'Publication removed'},'publisher');expect((await service.editorial.published(1,12,item.slug)).total).toBe(0);
  });
  it('retries failed filesystem delivery with bounded attempts and does not expose partial writes',async()=>{
    const item=await approve(await draft()),blocked=join(root,'not-a-directory');await writeFile(blocked,'blocked');const broken=new EditorialService(service.db,blocked);
    for(let i=0;i<5;i++){await broken.publishNext();await service.db.query('UPDATE editorial_articles SET run_at=now() WHERE id=$1',[item.id]);}
    const failed=await service.editorial.get(item.id);expect(failed.status).toBe('failed');expect(failed.attempts).toBe(5);expect((await service.editorial.published(1,12,item.slug)).total).toBe(0);
    const retry=await service.editorial.decide(item.id,{decision:'retry',expectedRevision:failed.revision,note:'Storage repaired'},'publisher');expect(retry.attempts).toBe(0);await service.editorial.publishNext();expect((await service.editorial.get(item.id)).status).toBe('published');
  });
  it('authenticates all editorial mutations, checks roles and CSRF, serves only approved public documents',async()=>{
    const token='test-editorial-admin-token-0123456789012345',editor='test-editorial-editor-token-0123456789012345';
    const config=loadConfig({NODE_ENV:'test',WAR_ARCHIVE_ADMIN_TOKEN:token,ADMIN_EDITOR_TOKEN:editor,ADMIN_TOTP_SECRET:'',DATABASE_URL:'',REMOTE_PUBLISH_ENABLED:'false'}),app=buildApi(service,config,{logger:false});
    try{
      expect((await app.inject({method:'GET',url:'/api/v1/editorial'})).statusCode).toBe(401);
      const login=await app.inject({method:'POST',url:'/api/v1/session',payload:{token:editor}}),cookie=String(login.headers['set-cookie']).split(';')[0]!,csrf=login.json<{data:{csrfToken:string}}>().data.csrfToken;
      const item=await draft();expect((await app.inject({method:'PATCH',url:`/api/v1/editorial/${item.id}`,headers:{cookie},payload:{}})).statusCode).toBe(403);
      expect((await app.inject({method:'POST',url:`/api/v1/editorial/${item.id}/decision`,headers:{cookie,'x-csrf-token':csrf},payload:{decision:'approve',expectedRevision:item.revision,note:'Forbidden'}})).statusCode).toBe(403);
      expect((await app.inject({method:'GET',url:`/blog/${item.slug}/`})).statusCode).toBe(404);
      expect((await app.inject({method:'GET',url:'/blog/'})).statusCode).toBe(200);
      expect((await app.inject({method:'GET',url:'/blog/feed.xml'})).body).toContain('<feed');
      expect((await app.inject({method:'GET',url:'/blog/?page=-1'})).statusCode).toBe(400);
    }finally{await app.close();}
  });
  it('preserves editorial documents, revisions and publications in portable backups and a fresh import',async()=>{
    const bundle=join(root,'portable');const manifest=await exportPortable(service.db,service.options.dataDir,bundle,{exportDir:service.options.exportDir});expect(manifest.tables.some(t=>t.name==='editorial_articles'&&t.rows>0)).toBe(true);
    const restored=await createArchiveService({dataDir:join(root,'restored-data'),exportDir:join(root,'restored-release'),autoPublish:false});
    try{await importPortable(restored.db,bundle,restored.options.dataDir,{exportDir:restored.options.exportDir});expect((await restored.editorial.list()).total).toBe((await service.editorial.list()).total);expect((await restored.db.query('SELECT * FROM blog_publications')).rows.length).toBeGreaterThan(0);}finally{await restored.close();}
  });
  it('blocks missing-source and withdrawal markers even when an old record row still appears published',async()=>{
    const item=await approve(await draft());await service.editorial.publishNext();
    await service.db.query("UPDATE records SET data=jsonb_set(data,'{sourceAvailability}','\"unavailable\"') WHERE id=$1",[recordId]);
    expect((await service.editorial.published(1,12,item.slug)).total).toBe(0);await expect(draft()).rejects.toThrow('공개 승인');
    await service.db.query("UPDATE records SET data=jsonb_set(data,'{sourceAvailability}','\"available\"') WHERE id=$1",[recordId]);
    await service.db.query("INSERT INTO withdrawals(record_id,reason) VALUES($1,'Test restored row with withdrawal marker')",[recordId]);
    expect((await service.editorial.published(1,12,item.slug)).total).toBe(0);await expect(draft()).rejects.toThrow('공개 승인');
    await service.db.query('DELETE FROM withdrawals WHERE record_id=$1',[recordId]);
  });
  it('withdraws related articles immediately on source revision change and preserves review history',async()=>{
    const item=await approve(await draft());await service.editorial.publishNext();expect((await service.editorial.published(1,12,item.slug)).total).toBe(1);
    const record=await service.getRecord(recordId);await service.updateRecord(recordId,{expectedRevision:record.public.revision,public:{summary:'Source corrected'}},'editor');
    expect((await service.editorial.published(1,12,item.slug)).total).toBe(0);expect(await service.editorial.reconcile()).toBeGreaterThan(0);expect((await service.editorial.get(item.id)).status).toBe('review');expect((await service.editorial.history(item.id)).length).toBeGreaterThan(1);
  });
});
