import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { ArchiveError, SourceInputSchema, SourceSchema, type ArchiveRecord, type Job, type RawItem, type Source } from '../domain/models.js';
import { PublicArchiveSchema, PublicRecordSchema, WarSchema, EntitySchema, CollectionSchema, ClaimSchema, type PublicArchive } from '../domain/contracts.js';
import { canAutoPublish, normalizeItem, recordId } from '../domain/normalization.js';
import { openDatabase, migrate, type Database, type Executor } from '../infrastructure/database.js';
import { collectPage, type SafeFetchOptions } from '../infrastructure/collector.js';
import { atomicJson, preserveJson,preserveBytes, sha256, within } from '../infrastructure/files.js';
import { uploadGitHub, verifyDeployment, type GitHubTarget } from '../infrastructure/publisher.js';
import { produceArtifacts,validateOriginal,uploadProducedFiles,removeProducedFiles,purgePublicUrls,verifyPublicRemoval,type CdnPurgeOptions,type ObjectStorageOptions,type MediaAsset,type ProductionResult } from '../infrastructure/production.js';

export interface ArchiveOptions { databaseUrl?: string; pglitePath?: string; dataDir: string; exportDir: string; publicSnapshotPath?: string; github?: GitHubTarget; fetcher?: typeof fetch; skipDnsCheckForTests?: boolean; autoPublish?: boolean; publicationIntervalSeconds?: number;collectionMaxItems?:number;objectStorage?:ObjectStorageOptions;cdnPurge?:CdnPurgeOptions }
type Row = Record<string, unknown>;
const iso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);
const safeError = (error: unknown): string => error instanceof ArchiveError ? `${error.code}: ${error.message}` : error instanceof z.ZodError ? 'VALIDATION_ERROR: 외부 데이터 형식 검증 실패' : 'PROCESSING_FAILED: 작업 처리 중 오류';
const jobFrom = (r: Row): Job => ({ id: String(r.id), kind: r.kind as Job['kind'], state: r.state as Job['state'], payload: r.payload as Record<string, unknown>, dedupeKey: String(r.dedupe_key), attempts: Number(r.attempts), maxAttempts: Number(r.max_attempts), runAt: iso(r.run_at), leaseUntil: r.lease_until ? iso(r.lease_until) : null, lastError: r.last_error ? String(r.last_error) : null, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });

export class ArchiveService {
  readonly workerId = randomUUID();
  constructor(public readonly db: Database, public readonly options: ArchiveOptions) {}
  async initialize(): Promise<void> { await mkdir(this.options.dataDir, { recursive: true }); await mkdir(this.options.exportDir, { recursive: true }); await migrate(this.db); }
  async close(): Promise<void> { await this.db.close(); }
  async health(): Promise<{ ok: boolean; database: string }> { await this.db.query('SELECT 1'); return { ok: true, database: this.options.databaseUrl ? 'postgresql' : 'pglite' }; }
  async audit(operation: string, actor: string, resourceId: string | null, detail: Record<string, unknown>, tx: Executor = this.db): Promise<void> { await tx.query('INSERT INTO audit_log(id,operation,actor,resource_id,detail) VALUES($1,$2,$3,$4,$5)', [randomUUID(), operation, actor, resourceId, JSON.stringify(detail)]); }
  async listAudit(): Promise<Row[]> { return (await this.db.query('SELECT id,operation,actor,resource_id AS "resourceId",detail,created_at AS "createdAt" FROM audit_log ORDER BY created_at DESC LIMIT 300')).rows; }
  async listSources(): Promise<Source[]> { return (await this.db.query('SELECT data FROM sources ORDER BY id')).rows.map((r) => SourceSchema.parse(r.data)); }
  async getSource(id: string, tx: Executor = this.db): Promise<Source> { const r = await tx.query('SELECT data FROM sources WHERE id=$1', [id]); if (!r.rows[0]) throw new ArchiveError('SOURCE_NOT_FOUND', '수집 출처를 찾을 수 없습니다.', 404); return SourceSchema.parse(r.rows[0].data); }
  async createSource(input: unknown, actor = 'operator'): Promise<Source> {
    const parsed = SourceInputSchema.parse(input), at = new Date().toISOString();
    const source: Source = { ...parsed, id: `src-${randomUUID()}`, checkpoint: { backfillPage: 1, backfillComplete: false,pageSize:Math.max(1,Math.min(50,this.options.collectionMaxItems??40)),refreshOffset:0,lastRefreshAt:null }, lastCheckedAt: null, lastSuccessAt: null, lastError: null, createdAt: at, updatedAt: at };
    if (source.policy.status === 'approved') source.policy = { ...source.policy, reviewedBy: actor, reviewedAt: at }; else source.policy = { ...source.policy, allowAutoPublish: false, reviewedAt: undefined, reviewedBy: undefined };
    await this.db.transaction(async (tx) => { await tx.query('INSERT INTO sources(id,data) VALUES($1,$2)', [source.id, JSON.stringify(source)]); await this.audit('source.create', actor, source.id, { provider: source.provider, policy: source.policy.status }, tx); }); return source;
  }
  async updateSource(id: string, input: unknown, actor = 'operator'): Promise<Source> {
    const previous = await this.getSource(id); const patch = SourceInputSchema.partial().parse(input); const parsed = SourceInputSchema.parse({ name:previous.name,provider:previous.provider,query:previous.query,warIds:previous.warIds,enabled:previous.enabled,intervalSeconds:previous.intervalSeconds,policy:previous.policy,...patch });
    const source: Source = { ...previous, ...parsed, updatedAt: new Date().toISOString() };
    if (patch.policy) source.policy = source.policy.status === 'approved' ? { ...source.policy, reviewedBy: actor, reviewedAt: source.updatedAt } : { ...source.policy, allowAutoPublish: false, reviewedAt: undefined, reviewedBy: undefined };
    if (source.provider!==previous.provider||source.query!==previous.query) source.checkpoint={backfillPage:1,backfillComplete:false,pageSize:Math.max(1,Math.min(50,this.options.collectionMaxItems??40)),refreshOffset:0,lastRefreshAt:null};
    await this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM publication_guard WHERE id=1 FOR UPDATE');
      await tx.query('UPDATE sources SET data=$2,updated_at=now() WHERE id=$1', [id, JSON.stringify(source)]);
      if(previous.policy.status==='approved'&&source.policy.status!=='approved'){
        const published=await tx.query("SELECT data FROM records WHERE source_id=$1 AND status='published' FOR UPDATE",[id]);
        for(const row of published.rows){const old=row.data as ArchiveRecord;const record:ArchiveRecord={...old,status:'review',updatedAt:source.updatedAt,public:{...old.public,revision:old.public.revision+1,updatedAt:source.updatedAt,review:{...old.public.review,provenance:'unverified'},changes:[...(old.public.changes??[]),{at:source.updatedAt,summary:'출처 공개 정책 재검토로 공개 보류'}]}};await this.saveVersion(record,tx);await this.enqueue('cleanup',{recordId:old.id},'cleanup:source-policy:'+old.id,tx);}
        if(published.rows.length)await this.enqueue('publish',{},'publish:source-policy',tx);
      }
      await this.audit('source.update', actor, id, { policy: source.policy.status, enabled: source.enabled }, tx);
    }); return source;
  }
  async enqueue(kind: Job['kind'], payload: Record<string, unknown>, dedupe: string, tx: Executor = this.db, delaySeconds = 0): Promise<string | null> { const id = `job-${randomUUID()}`; const r = await tx.query('INSERT INTO jobs(id,kind,payload,dedupe_key,run_at) VALUES($1,$2,$3,$4,now()+($5::text||\' seconds\')::interval) ON CONFLICT DO NOTHING RETURNING id', [id, kind, JSON.stringify(payload), dedupe, delaySeconds]); return r.rows[0] ? String(r.rows[0].id) : null; }
  async collectSource(id: string, mode: 'delta' | 'backfill' | 'refresh' = 'backfill'): Promise<{ jobId: string | null }> { const source = await this.getSource(id); if (!source.enabled) throw new ArchiveError('SOURCE_DISABLED', '중지된 출처입니다.');if(mode==='refresh')return{jobId:await this.db.transaction(tx=>this.enqueueRefresh(tx,source))}; const page = mode === 'delta' || source.checkpoint.backfillComplete ? 1 : source.checkpoint.backfillPage; return { jobId: await this.enqueue('collect', { sourceId: id, page, mode }, `collect:${id}:${mode}`) }; }
  async scheduleDueSources(): Promise<number> {
    let count = 0;
    await this.db.transaction(async (tx) => { const rows = await tx.query('SELECT id,data FROM sources WHERE next_run_at<=now() ORDER BY next_run_at FOR UPDATE SKIP LOCKED'); for (const r of rows.rows) { const source = SourceSchema.parse(r.data); if (!source.enabled) continue; const modes:('delta'|'backfill')[]=source.checkpoint.backfillComplete?['delta']:['delta','backfill'];for(const mode of modes){const page=mode==='delta'?1:source.checkpoint.backfillPage; const id = await this.enqueue('collect', { sourceId: source.id, mode, page }, `collect:${source.id}:${mode}`, tx);if(id)count++;}if(!source.checkpoint.lastRefreshAt||Date.now()-Date.parse(source.checkpoint.lastRefreshAt)>86_400_000||source.checkpoint.refreshOffset>0){if(await this.enqueueRefresh(tx,source))count++;} await tx.query('UPDATE sources SET next_run_at=now()+($2::text||\' seconds\')::interval WHERE id=$1', [source.id, source.intervalSeconds]); } }); return count;
  }
  private async enqueueRefresh(tx:Executor,source:Source,delaySeconds=0):Promise<string|null>{const total=Number((await tx.query('SELECT count(*)::integer AS n FROM records WHERE source_id=$1',[source.id])).rows[0]?.n??0);if(!total)return null;const offset=source.checkpoint.refreshOffset>=total?0:source.checkpoint.refreshOffset;const rows=await tx.query('SELECT external_id FROM records WHERE source_id=$1 ORDER BY external_id LIMIT 20 OFFSET $2',[source.id,offset]);const identifiers=rows.rows.map(r=>String(r.external_id));return this.enqueue('collect',{sourceId:source.id,mode:'refresh',page:1,identifiers,refreshOffset:offset,refreshTotal:total},`collect:${source.id}:refresh:${offset}`,tx,delaySeconds);}
  async listJobs(): Promise<Job[]> { return (await this.db.query('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 500')).rows.map(jobFrom); }
  async retryJob(id: string): Promise<void> { const r = await this.db.query("UPDATE jobs SET state='queued',attempts=0,last_error=null,run_at=now(),lease_until=null,owner=null,updated_at=now() WHERE id=$1 AND state IN ('failed','retry') RETURNING id", [id]); if (!r.rowCount) throw new ArchiveError('JOB_NOT_RETRYABLE', '재시도할 작업이 없습니다.', 409); }
  async claimJob(): Promise<Job | null> {
    return this.db.transaction(async (tx) => { await tx.query("UPDATE jobs SET state=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'retry' END,lease_until=null,owner=null,last_error='LEASE_EXPIRED: 작업자 연결이 종료되어 복구',updated_at=now() WHERE state='running' AND lease_until<now()"); const r = await tx.query("SELECT * FROM jobs WHERE state IN ('queued','retry') AND run_at<=now() ORDER BY CASE kind WHEN 'cleanup' THEN 0 WHEN 'publish' THEN 1 WHEN 'normalize' THEN 2 ELSE 3 END,created_at FOR UPDATE SKIP LOCKED LIMIT 1"); if (!r.rows[0]) return null; const id = String(r.rows[0].id); const claimed = await tx.query("UPDATE jobs SET state='running',attempts=attempts+1,owner=$2,lease_until=now()+interval '3 minutes',updated_at=now() WHERE id=$1 RETURNING *", [id, this.workerId]); return jobFrom(claimed.rows[0]!); });
  }
  async runNextJob(): Promise<Job | null> {
    const job = await this.claimJob(); if (!job) return null;
    let leaseRenewalFailed=false;
    const heartbeat=setInterval(()=>{void this.db.query("UPDATE jobs SET lease_until=now()+interval '3 minutes',updated_at=now() WHERE id=$1 AND owner=$2 AND state='running'",[job.id,this.workerId]).catch(()=>{leaseRenewalFailed=true;});},30_000);
    heartbeat.unref();
    try { if (job.kind === 'collect') await this.processCollection(job); else if (job.kind === 'normalize') await this.processNormalization(job);else if(job.kind==='produce')await this.processProduction(job);else if(job.kind==='cleanup')await this.processCleanup(job); else await this.publish({ target: this.options.github ? 'github' : 'local', job });if(leaseRenewalFailed)throw new ArchiveError('LEASE_RENEWAL_FAILED','작업 실행 상태를 확인할 수 없어 재검증이 필요합니다.',503); await this.db.query("UPDATE jobs SET state='done',lease_until=null,owner=null,last_error=null,updated_at=now() WHERE id=$1 AND owner=$2", [job.id, this.workerId]); }
    catch (error) { const message = safeError(error); await this.db.transaction(async (tx) => { await tx.query("UPDATE jobs SET state=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'retry' END,run_at=now()+($3::text||' seconds')::interval,lease_until=null,owner=null,last_error=$2,updated_at=now() WHERE id=$1 AND owner=$4", [job.id, message, Math.min(3600, 15 * 2 ** job.attempts), this.workerId]); if (job.kind === 'collect' && typeof job.payload.sourceId === 'string') { const s = await this.getSource(job.payload.sourceId, tx); s.lastCheckedAt = new Date().toISOString(); s.lastError = message; await tx.query('UPDATE sources SET data=$2,updated_at=now() WHERE id=$1', [s.id, JSON.stringify(s)]); } await this.audit('job.failed', 'worker', job.id, { kind: job.kind, error: message }, tx); }); }
    finally{clearInterval(heartbeat);}
    return (await this.listJobs()).find((r) => r.id === job.id) ?? job;
  }
  private async assertLease(tx: Executor, job: Job): Promise<void> { const r=await tx.query("SELECT id FROM jobs WHERE id=$1 AND owner=$2 AND state='running' AND lease_until>now() FOR UPDATE",[job.id,this.workerId]);if(!r.rowCount)throw new ArchiveError('LEASE_LOST','작업 실행 권한이 만료되었습니다.',409); }
  private async processCollection(job: Job): Promise<void> {
    const source=await this.getSource(String(job.payload.sourceId));
    if(!source.enabled)throw new ArchiveError('SOURCE_DISABLED','중지된 수집 출처입니다.');
    const page=Number(job.payload.page??1),mode=job.payload.mode==='refresh'?'refresh':job.payload.mode==='delta'?'delta':'backfill';
    const identifiers=mode==='refresh'?z.array(z.string()).max(20).parse(job.payload.identifiers):undefined;
    const options:SafeFetchOptions={fetcher:this.options.fetcher,skipDnsCheckForTests:this.options.skipDnsCheckForTests};
    const result=await collectPage(source,page,options,identifiers);
    const stored:{item:RawItem;hash:string;filePath:string}[]=[];
    for(const item of result.items)stored.push({item,...await preserveJson(this.options.dataDir,item.raw)});
    await this.db.transaction(async(tx)=>{
      await this.assertLease(tx,job);const latest=await this.getSource(source.id,tx);
      if(latest.provider!==source.provider||latest.query!==source.query)throw new ArchiveError('SOURCE_CHANGED','실행 중 출처 설정이 바뀌었습니다. 다시 수집하세요.',409);
      for(const entry of stored){const row=await tx.query('INSERT INTO raw_items(source_id,identifier,raw_hash,file_path,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING identifier',[source.id,entry.item.identifier,entry.hash,entry.filePath,JSON.stringify(entry.item)]);if(row.rowCount)await this.enqueue('normalize',{sourceId:source.id,identifier:entry.item.identifier,rawHash:entry.hash},`normalize:${source.id}:${entry.item.identifier}:${entry.hash}`,tx);}
      const at=new Date().toISOString();latest.lastCheckedAt=at;latest.lastSuccessAt=at;latest.lastError=null;
      if(mode==='backfill')latest.checkpoint={...latest.checkpoint,backfillPage:result.hasMore?page+1:page,backfillComplete:!result.hasMore};
      if(mode==='refresh'&&identifiers){
        const found=new Set(result.items.map(item=>item.identifier));
        for(const identifier of identifiers){
          const rows=await tx.query('SELECT data FROM records WHERE source_id=$1 AND external_id=$2 FOR UPDATE',[source.id,identifier]);
          const old=rows.rows[0]?.data as ArchiveRecord|undefined;if(!old)continue;
          const availability=found.has(identifier)?'available':'unavailable';
          if(old.sourceAvailability!==availability){const record:ArchiveRecord={...old,sourceAvailability:availability,status:availability==='unavailable'&&old.status!=='withdrawn'?'review':old.status,updatedAt:at,public:{...old.public,revision:old.public.revision+1,updatedAt:at,changes:[...(old.public.changes??[]),{at,summary:availability==='unavailable'?'원 소장처에서 자료를 확인할 수 없어 검토 대기':'원 소장처 자료 접근 재확인'}]}};await this.saveVersion(record,tx);if(old.status==='published'&&availability==='unavailable')await this.schedulePublish(tx);}
        }
        const next=Number(job.payload.refreshOffset??0)+identifiers.length,complete=next>=Number(job.payload.refreshTotal??0);
        latest.checkpoint={...latest.checkpoint,refreshOffset:complete?0:next,lastRefreshAt:complete?at:latest.checkpoint.lastRefreshAt};
        if(!complete)await this.enqueueRefresh(tx,latest,60);
      }
      latest.updatedAt=at;await tx.query('UPDATE sources SET data=$2,updated_at=now() WHERE id=$1',[source.id,JSON.stringify(latest)]);
      await this.audit('collection.complete','worker',source.id,{page,discovered:result.items.length,mode,missing:identifiers?identifiers.length-result.items.length:0},tx);
    });
  }
  private async processNormalization(job: Job): Promise<void> {
    await this.db.transaction(async (tx) => { await this.assertLease(tx,job); const source = await this.getSource(String(job.payload.sourceId), tx); const r = await tx.query('SELECT data,raw_hash FROM raw_items WHERE source_id=$1 AND identifier=$2 AND raw_hash=$3', [source.id, job.payload.identifier, job.payload.rawHash]); if (!r.rows[0]) throw new ArchiveError('RAW_NOT_FOUND', '보존 자료를 찾을 수 없습니다.', 404);const newest=await tx.query('SELECT raw_hash FROM raw_items WHERE source_id=$1 AND identifier=$2 ORDER BY ingest_sequence DESC LIMIT 1',[source.id,job.payload.identifier]);if(newest.rows[0]?.raw_hash!==job.payload.rawHash)return; const item = r.rows[0].data as RawItem, id = recordId(source.id, item.identifier); const previous = await tx.query('SELECT data FROM records WHERE id=$1 FOR UPDATE', [id]); const old = previous.rows[0]?.data as ArchiveRecord | undefined; if (old?.rawHash === r.rows[0].raw_hash) return;
      const at = new Date().toISOString(), publicRecord = normalizeItem(source, item, at, (old?.public.revision ?? 0) + 1); const withdrawn = await tx.query('SELECT record_id FROM withdrawals WHERE record_id=$1', [id]);
      const status: ArchiveRecord['status'] = withdrawn.rowCount ? 'withdrawn' : canAutoPublish(source, publicRecord) && !old ? 'published' : 'review';
      const preserve=old&&(old.editorialLocked||old.public.review.content==='reviewed');
      const publicData=preserve?{...old.public,revision:publicRecord.revision,updatedAt:at,source:{...old.public.source,accessedAt:at},changes:[...(old.public.changes??[]),{at,summary:'원 소장처 변경 후보 수집 · 편집 내용 보존'}]}:{...publicRecord,...(old?.public.transcript?{transcript:old.public.transcript}:{}),...(old?.public.translation?{translation:old.public.translation}:{}),changes:[...(old?.public.changes??[]),...(publicRecord.changes??[])]};
      const record: ArchiveRecord = { id, sourceId: source.id, status, public: publicData,...(preserve?{sourceCandidate:publicRecord,editorialLocked:true}:{}),sourceAvailability:'available', rawHash: String(r.rows[0].raw_hash), processing: old?.processing??{ ocr: 'not-requested', translation: 'not-requested' }, createdAt: old?.createdAt ?? at, updatedAt: at };
      await tx.query('INSERT INTO records(id,source_id,external_id,status,data,raw_hash,revision) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,data=EXCLUDED.data,raw_hash=EXCLUDED.raw_hash,revision=EXCLUDED.revision,updated_at=now()', [id, source.id, item.identifier, status, JSON.stringify(record), record.rawHash, publicRecord.revision]); await tx.query('INSERT INTO record_versions(record_id,revision,data) VALUES($1,$2,$3)', [id, publicRecord.revision, JSON.stringify(record)]);
      await this.audit('record.normalized', 'worker', id, { revision: publicRecord.revision, status, ocr: 'not-requested' }, tx);await this.enqueue('produce',{recordId:id},`produce:${id}:r${publicRecord.revision}`,tx); if (status === 'published' || old?.status === 'published') await this.schedulePublish(tx);
    });
  }
  private async schedulePublish(tx: Executor): Promise<void> { if (this.options.autoPublish !== false) await this.enqueue('publish', {}, 'publish:automatic', tx, this.options.publicationIntervalSeconds ?? 60); }
  async listAssets(id:string):Promise<MediaAsset[]>{return(await this.db.query('SELECT id,record_id AS "recordId",sha256,mime_type AS "mimeType",file_path AS "filePath",filename,size_bytes AS "sizeBytes",publish_derivatives AS "publishDerivatives",rights_attestation AS "rightsAttestation",status,production,created_at AS "createdAt" FROM media_assets WHERE record_id=$1 ORDER BY created_at',[id])).rows.map(r=>({...r,sizeBytes:Number(r.sizeBytes),createdAt:iso(r.createdAt)})as unknown as MediaAsset);}
  async uploadOriginal(id:string,input:unknown,actor='operator'):Promise<MediaAsset>{
    const parsed=z.object({data:z.string().min(4).max(34_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),mimeType:z.string().max(100),filename:z.string().min(1).max(200).refine(v=>![...v].some(c=>c==='/'||c==='\\'||c.charCodeAt(0)<32)),rightsAttestation:z.string().min(20).max(4000),publishDerivatives:z.boolean().default(false)}).strict().parse(input);
    const currentRecord=await this.getRecord(id);if(currentRecord.status==='withdrawn')throw new ArchiveError('RECORD_WITHDRAWN','Withdrawn records cannot accept new originals',409);const bytes=Buffer.from(parsed.data,'base64');validateOriginal(bytes,parsed.mimeType);const hash=sha256(bytes);const path=within(this.options.dataDir,'originals','media',hash.slice(0,2),`${hash}.bin`);await preserveBytes(path,bytes,hash);
    const assetId=`asset-${randomUUID()}`;await this.db.transaction(async(tx)=>{await tx.query("INSERT INTO media_assets(id,record_id,sha256,mime_type,file_path,filename,size_bytes,rights_attestation,publish_derivatives,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued') ON CONFLICT(record_id,sha256) DO NOTHING",[assetId,id,hash,parsed.mimeType,path,parsed.filename,bytes.length,parsed.rightsAttestation,parsed.publishDerivatives]);await this.enqueue('produce',{recordId:id},`produce:${id}:${hash}`,tx);await this.audit('original.upload',actor,id,{sha256:hash,mimeType:parsed.mimeType,size:bytes.length,publishDerivatives:parsed.publishDerivatives},tx);});return(await this.listAssets(id)).find(a=>a.sha256===hash)!;
  }
  async queueProduction(id:string):Promise<{jobId:string|null}>{const record=await this.getRecord(id);return{jobId:await this.enqueue('produce',{recordId:id},`produce:${id}:r${record.public.revision}`)};}
  async reviewAsset(recordId:string,assetId:string,input:unknown,actor='operator'):Promise<MediaAsset>{
    const parsed=z.object({rightsAttestation:z.string().min(20).max(4000),publishDerivatives:z.boolean()}).strict().parse(input);
    await this.db.transaction(async(tx)=>{await tx.query('SELECT id FROM publication_guard WHERE id=1 FOR UPDATE');const rows=await tx.query('SELECT id FROM media_assets WHERE id=$1 AND record_id=$2 FOR UPDATE',[assetId,recordId]);if(!rows.rows.length)throw new ArchiveError('ASSET_NOT_FOUND','원본 자료를 찾을 수 없습니다.',404);const records=await tx.query('SELECT data FROM records WHERE id=$1 FOR UPDATE',[recordId]);const record=records.rows[0]?.data as ArchiveRecord|undefined;if(!record)throw new ArchiveError('RECORD_NOT_FOUND','자료를 찾을 수 없습니다.',404);if(record.status==='withdrawn'&&parsed.publishDerivatives)throw new ArchiveError('RECORD_WITHDRAWN','철회된 자료는 공개할 수 없습니다.',409);
      await tx.query("UPDATE media_assets SET rights_attestation=$2,publish_derivatives=$3,status='queued',updated_at=now() WHERE id=$1",[assetId,parsed.rightsAttestation,parsed.publishDerivatives]);
      if(parsed.publishDerivatives)await this.enqueue('produce',{recordId},'produce:asset-review:'+assetId,tx);else{await this.enqueue('cleanup',{recordId,assetId},'cleanup:asset:'+assetId,tx);const at=new Date().toISOString();const updated:ArchiveRecord={...record,public:{...record.public,revision:record.public.revision+1,updatedAt:at,media:{...record.public.media,displayAllowed:false}},updatedAt:at};await this.saveVersion(updated,tx);await this.schedulePublish(tx);}
      await this.audit('asset.rights-review',actor,assetId,{recordId,publishDerivatives:parsed.publishDerivatives},tx);
    });return(await this.listAssets(recordId)).find(a=>a.id===assetId)!;
  }
  private async processProduction(job:Job):Promise<void>{
    const record=await this.getRecord(String(job.payload.recordId)),assets=await this.listAssets(record.id);
    if(record.status==='withdrawn'){await this.audit('production.skipped','worker',record.id,{reason:'withdrawn'});return;}
    const result:ProductionResult=await produceArtifacts(record.public,assets,this.options.dataDir);
    const productionId=`production-${randomUUID()}`;
    const approved=assets.filter(a=>a.publishDerivatives).map(a=>a.sha256.slice(0,16));
    const plannedFiles=result.files.map(file=>file.kind==='thumbnail'&&approved.some(prefix=>file.path.includes(prefix))&&this.options.objectStorage?{...file,objectKey:`archive/${record.id}/${file.sha256}`,...(this.options.objectStorage.publicBaseUrl?{url:`${this.options.objectStorage.publicBaseUrl.replace(/\/$/,'')}/archive/${record.id}/${file.sha256}`}:{})}:file);
    // Persist planned keys before network writes so a crash cannot orphan a public derivative.
    await this.db.transaction(async(tx)=>{await this.assertLease(tx,job);await tx.query('INSERT INTO productions(id,record_id,revision,data) VALUES($1,$2,$3,$4)',[productionId,record.id,record.public.revision,JSON.stringify({...result,files:plannedFiles})]);});
    await this.db.transaction(async(tx)=>{await tx.query('SELECT id FROM publication_guard WHERE id=1 FOR UPDATE');await this.assertLease(tx,job);const rows=await tx.query('SELECT data FROM records WHERE id=$1 FOR UPDATE',[record.id]);const current=rows.rows[0]?.data as ArchiveRecord|undefined;if(!current)throw new ArchiveError('RECORD_NOT_FOUND','자료를 찾을 수 없습니다.',404);
      if(current.status==='published'&&current.public.review.content==='reviewed'&&current.public.sensitivity==='none'&&this.options.objectStorage&&assets.some(a=>a.publishDerivatives)){
        // Only explicitly authorized previews are public; extraction and originals remain private.
        const preview=result.files.filter(f=>f.kind==='thumbnail'&&approved.some(prefix=>f.path.includes(prefix)));
        const remote=await uploadProducedFiles(record.id,preview,this.options.objectStorage);result.files=result.files.map(f=>remote.find(x=>x.path===f.path)??f);
      }
      await tx.query('UPDATE productions SET data=$2 WHERE id=$1',[productionId,JSON.stringify(result)]);
      const unavailable=result.steps.some(s=>s.status==='unavailable');for(const asset of assets)await tx.query('UPDATE media_assets SET status=$2,production=$3,updated_at=now() WHERE id=$1',[asset.id,unavailable?'unavailable':'complete',JSON.stringify(result)]);
      const extracted=Boolean(result.text);const thumbnail=result.files.find(f=>f.kind==='thumbnail'&&f.url);const canUpdate=current.public.revision===record.public.revision&&current.status!=='withdrawn';
      const changed=Boolean((result.text&&!current.public.transcript&&current.public.review.content!=='reviewed')||(thumbnail&&thumbnail.url!==current.public.media.thumbnailUrl)||(result.durationSeconds!==undefined&&result.durationSeconds!==current.public.media.durationSeconds));
      const changedText=Boolean(result.text&&!current.public.transcript&&current.public.review.content!=='reviewed');
      if(canUpdate&&changed){
        const at=new Date().toISOString();const updated:ArchiveRecord={...current,status:changedText?'review':current.status,updatedAt:at,processing:{...current.processing,ocr:extracted?'complete':unavailable?'unavailable':current.processing.ocr},public:{...current.public,revision:current.public.revision+1,updatedAt:at,review:{...current.public.review,content:changedText?'machine-draft':current.public.review.content},...(!current.public.transcript&&current.public.review.content!=='reviewed'&&result.text?{transcript:result.text}:{}),media:{...current.public.media,...(thumbnail?{thumbnailUrl:thumbnail.url,displayAllowed:true,attribution:undefined}:{}),...(result.durationSeconds!==undefined?{durationSeconds:result.durationSeconds}:{})},changes:[...(current.public.changes??[]),{at,summary:changedText?'원본 자료 판독 결과 생성 · 공개 검토 대기':'승인된 자료의 열람용 미디어 생성'}]}};
        await this.saveVersion(updated,tx);if(current.status==='published')await this.schedulePublish(tx);
      }
      await this.audit('production.complete','worker',record.id,{assets:assets.length,files:result.files.length,steps:result.steps.map(s=>({operation:s.operation,status:s.status}))},tx);
    });
  }
  async listProductions(id:string):Promise<Row[]>{return(await this.db.query('SELECT id,revision,data,created_at AS "createdAt" FROM productions WHERE record_id=$1 ORDER BY created_at DESC',[id])).rows;}
  private async processCleanup(job:Job):Promise<void>{
    const id=String(job.payload.recordId),withdrawn=await this.db.query('SELECT record_id FROM withdrawals WHERE record_id=$1',[id]);
    const record=await this.getRecord(id),source=await this.getSource(record.sourceId),assets=await this.listAssets(id),assetId=typeof job.payload.assetId==='string'?job.payload.assetId:undefined,targetAsset=assetId?assets.find(a=>a.id===assetId):undefined;
    if(!withdrawn.rows.length&&source.policy.status==='approved'&&!(targetAsset&&!targetAsset.publishDerivatives))throw new ArchiveError('CLEANUP_NOT_WITHDRAWN','공개가 허용된 자료는 철회 작업으로 삭제할 수 없습니다.',409);
    const rows=await this.db.query('SELECT data FROM productions WHERE record_id=$1 UNION ALL SELECT production AS data FROM media_assets WHERE record_id=$1 AND production IS NOT NULL',[id]);
    const files=rows.rows.flatMap(row=>(row.data as ProductionResult).files).filter(file=>!targetAsset||file.path.includes(targetAsset.sha256.slice(0,16))),keys=[...new Set(files.map(f=>f.objectKey).filter((key):key is string=>Boolean(key)))],urls=[...new Set(files.filter(f=>f.objectKey).map(f=>f.url).filter((url):url is string=>Boolean(url)))];
    if(keys.length&&!this.options.objectStorage)throw new ArchiveError('STORAGE_CONFIGURATION_REQUIRED','공개 파일 철회를 위해 원래 저장소 설정이 필요합니다.',503);
    if(keys.length)await removeProducedFiles(id,keys,this.options.objectStorage!);
    if(urls.length&&this.options.cdnPurge)await purgePublicUrls(urls,this.options.cdnPurge,this.options.fetcher);
    if(urls.length&&this.options.objectStorage?.publicBaseUrl)await verifyPublicRemoval(urls,this.options.objectStorage.publicBaseUrl,this.options.fetcher);
    await this.db.transaction(async(tx)=>{await this.assertLease(tx,job);await this.audit('withdrawal.files-verified','worker',id,{keys:keys.length,publicUrls:urls.length,cdnRequested:Boolean(urls.length&&this.options.cdnPurge),originalsPreserved:true},tx);});
  }
  async listRecords(status?: string): Promise<ArchiveRecord[]> { const rows = status ? await this.db.query('SELECT data FROM records WHERE status=$1 ORDER BY updated_at DESC LIMIT 2000', [status]) : await this.db.query('SELECT data FROM records ORDER BY updated_at DESC LIMIT 2000'); return rows.rows.map((r) => r.data as ArchiveRecord); }
  async getRecord(id: string): Promise<ArchiveRecord> { const r = await this.db.query('SELECT data FROM records WHERE id=$1', [id]); if (!r.rows[0]) throw new ArchiveError('RECORD_NOT_FOUND', '자료를 찾을 수 없습니다.', 404); return r.rows[0].data as ArchiveRecord; }
  async updateRecord(id: string, input: unknown, actor = 'operator'): Promise<ArchiveRecord> { const patch = z.object({ public: PublicRecordSchema.partial().optional(), expectedRevision: z.number().int().optional(), processing: z.object({ ocr: z.enum(['not-requested','unavailable','complete']).optional(), translation: z.enum(['not-requested','unavailable','complete']).optional() }).optional() }).strict().parse(input); return this.db.transaction(async (tx) => { const r = await tx.query('SELECT data FROM records WHERE id=$1 FOR UPDATE', [id]); if (!r.rows[0]) throw new ArchiveError('RECORD_NOT_FOUND','자료를 찾을 수 없습니다.',404); const old = r.rows[0].data as ArchiveRecord; if (patch.expectedRevision !== undefined && old.public.revision !== patch.expectedRevision) throw new ArchiveError('REVISION_CONFLICT','자료가 변경되었습니다. 새로고침하세요.',409); const at = new Date().toISOString(); const record = { ...old, editorialLocked:true,status: old.status === 'withdrawn' ? 'withdrawn' as const : 'review' as const, public: PublicRecordSchema.parse({ ...old.public, ...patch.public, id, revision: old.public.revision + 1, updatedAt: at, changes: [...(old.public.changes ?? []), { at, summary: '편집자 자료 설명 수정' }] }), processing: { ...old.processing, ...patch.processing }, updatedAt: at }; await this.saveVersion(record, tx); await this.audit('record.update',actor,id,{ revision:record.public.revision },tx); if(old.status==='published') await this.schedulePublish(tx); return record; }); }
  private async saveVersion(record: ArchiveRecord, tx: Executor): Promise<void> { await tx.query('UPDATE records SET data=$2,status=$3,revision=$4,updated_at=now() WHERE id=$1',[record.id,JSON.stringify(record),record.status,record.public.revision]); await tx.query('INSERT INTO record_versions(record_id,revision,data) VALUES($1,$2,$3)',[record.id,record.public.revision,JSON.stringify(record)]); }
  async reviewRecord(id: string, input: { decision: 'approve'|'reject'; note: string; expectedRevision?: number }, actor = 'operator'): Promise<ArchiveRecord> { const parsed = z.object({decision:z.enum(['approve','reject']),note:z.string().min(1).max(4000),expectedRevision:z.number().int().optional()}).parse(input); return this.db.transaction(async (tx) => { const r=await tx.query('SELECT data FROM records WHERE id=$1 FOR UPDATE',[id]); if(!r.rows[0]) throw new ArchiveError('RECORD_NOT_FOUND','자료를 찾을 수 없습니다.',404); const old=r.rows[0].data as ArchiveRecord; if(parsed.expectedRevision!==undefined&&old.public.revision!==parsed.expectedRevision) throw new ArchiveError('REVISION_CONFLICT','자료가 변경되었습니다.',409); const gate=await tx.query('SELECT record_id FROM withdrawals WHERE record_id=$1',[id]); if(gate.rowCount) throw new ArchiveError('RECORD_WITHDRAWN','철회된 자료는 공개할 수 없습니다.',409); const source=await this.getSource(old.sourceId,tx); if(parsed.decision==='approve'&&source.policy.status!=='approved') throw new ArchiveError('SOURCE_POLICY_REQUIRED','출처 정책을 먼저 검토하세요.',409); const at=new Date().toISOString(); const record:ArchiveRecord={...old,status:parsed.decision==='approve'?'published':'draft',updatedAt:at,public:{...old.public,revision:old.public.revision+1,updatedAt:at,review:{...old.public.review,provenance:'checked',content:'reviewed'},changes:[...(old.public.changes??[]),{at,summary:parsed.decision==='approve'?'편집 검토 후 공개 승인':'공개 보류'}]}}; await this.saveVersion(record,tx); await this.audit(`record.${parsed.decision}`,actor,id,{revision:record.public.revision,note:parsed.note},tx);if(parsed.decision==='approve')await this.enqueue('produce',{recordId:id},'produce:approved:'+id+':'+record.public.revision,tx); await this.schedulePublish(tx); return record; }); }
  async withdrawRecord(id: string, reason: string, actor = 'operator', expectedRevision?: number): Promise<ArchiveRecord> { z.string().min(1).max(4000).parse(reason); return this.db.transaction(async(tx)=>{await tx.query('SELECT id FROM publication_guard WHERE id=1 FOR UPDATE');const r=await tx.query('SELECT data FROM records WHERE id=$1 FOR UPDATE',[id]);if(!r.rows[0])throw new ArchiveError('RECORD_NOT_FOUND','자료를 찾을 수 없습니다.',404);const old=r.rows[0].data as ArchiveRecord;if(expectedRevision!==undefined&&old.public.revision!==expectedRevision)throw new ArchiveError('REVISION_CONFLICT','자료가 변경되었습니다.',409);const at=new Date().toISOString();const record:ArchiveRecord={...old,status:'withdrawn',updatedAt:at,public:{...old.public,revision:old.public.revision+1,updatedAt:at}};await tx.query('INSERT INTO withdrawals(record_id,reason) VALUES($1,$2) ON CONFLICT(record_id) DO UPDATE SET reason=EXCLUDED.reason,withdrawn_at=now()',[id,reason]);await this.saveVersion(record,tx);await this.audit('record.withdraw',actor,id,{reason},tx);await this.enqueue('cleanup',{recordId:id},'cleanup:'+id,tx);await this.enqueue('publish',{},'publish:withdrawal',tx);return record;}); }
  async recordVersions(id: string): Promise<ArchiveRecord[]> { return (await this.db.query('SELECT data FROM record_versions WHERE record_id=$1 ORDER BY revision DESC',[id])).rows.map((r)=>r.data as ArchiveRecord); }
  async listCatalog(kind: string): Promise<unknown[]> { return (await this.db.query('SELECT data FROM catalog WHERE kind=$1 ORDER BY id',[kind])).rows.map((r)=>r.data); }
  async upsertCatalog(kind: 'war'|'entity'|'collection'|'claim', input: unknown, actor='operator'): Promise<unknown> { const schema=kind==='war'?WarSchema:kind==='entity'?EntitySchema:kind==='collection'?CollectionSchema:ClaimSchema;const data=schema.parse(input);await this.db.transaction(async(tx)=>{await tx.query('INSERT INTO catalog(kind,id,data) VALUES($1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET data=EXCLUDED.data',[kind,data.id,JSON.stringify(data)]);await this.audit('catalog.update',actor,data.id,{kind},tx);await this.schedulePublish(tx);});return data; }
  async deleteCatalog(kind:string,id:string,actor='operator'):Promise<void>{await this.db.transaction(async(tx)=>{await tx.query('DELETE FROM catalog WHERE kind=$1 AND id=$2',[kind,id]);await this.audit('catalog.delete',actor,id,{kind},tx);await this.schedulePublish(tx);});}
  async buildSnapshot(releaseId = `rel-${randomUUID()}`): Promise<PublicArchive> { return this.db.transaction((tx)=>this.snapshotInTransaction(tx,releaseId)); }
  private async snapshotInTransaction(tx:Executor,releaseId:string):Promise<PublicArchive>{
    const rows=await tx.query("SELECT r.data FROM records r WHERE r.status='published' AND NOT EXISTS(SELECT 1 FROM withdrawals w WHERE w.record_id=r.id) ORDER BY r.id");
    const sources=(await tx.query('SELECT data FROM sources')).rows.map(r=>SourceSchema.parse(r.data));
    const records=rows.rows.map(r=>PublicRecordSchema.parse((r.data as ArchiveRecord).public));
    const catalog=(await tx.query('SELECT kind,data FROM catalog ORDER BY id')).rows;
    const publicIds=new Set(records.map(r=>r.id));
    return PublicArchiveSchema.parse({schemaVersion:1,releaseId,generatedAt:new Date().toISOString(),records,
      wars:catalog.filter(x=>x.kind==='war').map(x=>x.data),entities:catalog.filter(x=>x.kind==='entity').map(x=>x.data),
      collections:catalog.filter(x=>x.kind==='collection').map(x=>{const c=CollectionSchema.parse(x.data);return{...c,recordIds:c.recordIds.filter(id=>publicIds.has(id))};}),
      claims:catalog.filter(x=>x.kind==='claim').map(x=>ClaimSchema.parse(x.data)).filter(c=>c.public&&(!c.subjectId.startsWith('rec-')||publicIds.has(c.subjectId))),
      coverage:{sources:sources.length,records:records.length,lastCollectedAt:sources.map(s=>s.lastSuccessAt).filter((s):s is string=>Boolean(s)).sort().at(-1)??null,
        limitations:['수록 자료는 전체 전쟁 기록의 일부입니다.','원 소장처의 설명을 기록하며, 출처의 주장을 독립적으로 검증한 것으로 표시하지 않습니다.','권리는 자료별로 확인해야 하며 링크 제공은 원문 재사용 허가를 뜻하지 않습니다.']}});
  }
  async publish(input: { target:'local'|'github'; job?:Job } = {target:'local'}): Promise<Row> {
    const target=input.target;
    if(target==='github'&&!this.options.github)throw new ArchiveError('REMOTE_DISABLED','원격 발행 설정이 없습니다.',409);
    let failure:unknown;
    const result=await this.db.transaction(async(tx)=>{
      // The shared guard serializes worker and direct publication with withdrawals.
      await tx.query('SELECT id FROM publication_guard WHERE id=1 FOR UPDATE');
      if(input.job)await this.assertLease(tx,input.job);
      let snapshot=await this.snapshotInTransaction(tx,`rel-${randomUUID()}`);
      const previousId=input.job?.payload.releaseId;
      const previous=typeof previousId==='string'?(await tx.query('SELECT snapshot FROM publications WHERE id=$1',[previousId])).rows[0]:undefined;
      if(previous){const old=PublicArchiveSchema.parse(previous.snapshot);if(JSON.stringify(old.records)===JSON.stringify(snapshot.records)&&JSON.stringify(old.wars)===JSON.stringify(snapshot.wars)&&JSON.stringify(old.entities)===JSON.stringify(snapshot.entities)&&JSON.stringify(old.collections)===JSON.stringify(snapshot.collections)&&JSON.stringify(old.claims)===JSON.stringify(snapshot.claims))snapshot=old;}
      const id=snapshot.releaseId;
      const manifest={schemaVersion:1,releaseId:id,generatedAt:snapshot.generatedAt,sha256:sha256(JSON.stringify(snapshot)),recordCount:snapshot.records.length,versions:snapshot.records.map(r=>({id:r.id,revision:r.revision})),target};
      await tx.query("INSERT INTO publications(id,target,status,record_count,manifest,snapshot) VALUES($1,$2,'prepared',$3,$4,$5) ON CONFLICT(id) DO UPDATE SET status='prepared',last_error=null",[id,target,snapshot.records.length,JSON.stringify(manifest),JSON.stringify(snapshot)]);
      if(input.job)await tx.query("UPDATE jobs SET payload=jsonb_set(payload,'{releaseId}',$2::jsonb) WHERE id=$1",[input.job.id,JSON.stringify(id)]);
      try{
        const path=within(this.options.exportDir,id);
        await atomicJson(resolve(path,'archive.json'),snapshot);await atomicJson(resolve(path,'manifest.json'),manifest);
        const verified=PublicArchiveSchema.parse(JSON.parse(await readFile(resolve(path,'archive.json'),'utf8')) as unknown);
        if(sha256(JSON.stringify(verified))!==manifest.sha256)throw new ArchiveError('PUBLICATION_VERIFY_FAILED','공개본 무결성 검사 실패',500);
        let complete=true;let evidence:Record<string,unknown>={localVerified:true};
        if(target==='github'){const uploaded=await uploadGitHub(snapshot,this.options.github!,this.options.fetcher);complete=uploaded.verified;evidence={...evidence,...uploaded};}
        else{await atomicJson(resolve(this.options.exportDir,'archive.json'),snapshot);if(this.options.publicSnapshotPath)await atomicJson(this.options.publicSnapshotPath,snapshot);}
        if(input.job)await this.assertLease(tx,input.job);
        await tx.query('UPDATE publications SET status=$2,published_at=CASE WHEN $3 THEN now() ELSE null END,manifest=$4 WHERE id=$1',[id,complete?'published':'prepared',complete,JSON.stringify({...manifest,evidence})]);
        await this.audit(complete?'publication.complete':'publication.awaiting-verification','worker',id,{target,...evidence},tx);
      }catch(error){failure=error;await tx.query("UPDATE publications SET status='failed',last_error=$2 WHERE id=$1",[id,safeError(error)]);}
      return (await tx.query('SELECT id,target,status,record_count AS "recordCount",manifest,created_at AS "createdAt",published_at AS "publishedAt",last_error AS "lastError" FROM publications WHERE id=$1',[id])).rows[0]!;
    });
    if(failure)throw failure;return result;
  }
  async listPublications():Promise<Row[]>{return(await this.db.query('SELECT id,target,status,record_count AS "recordCount",manifest,created_at AS "createdAt",published_at AS "publishedAt",last_error AS "lastError" FROM publications ORDER BY created_at DESC LIMIT 100')).rows;}
  async verifyPendingPublications():Promise<number>{
    const url=this.options.github?.deploymentUrl;if(!url)return 0;
    const pending=await this.db.query("SELECT id,manifest FROM publications WHERE target='github' AND status='prepared' ORDER BY created_at DESC LIMIT 10");let completed=0;
    for(const row of pending.rows){const id=String(row.id),manifest=row.manifest as Record<string,unknown>;try{if(await verifyDeployment(id,url,this.options.fetcher,String(manifest.sha256))){await this.db.transaction(async(tx)=>{await tx.query("UPDATE publications SET status='published',published_at=now(),last_error=null WHERE id=$1 AND status='prepared'",[id]);await this.audit('publication.live-verified','worker',id,{target:'github'},tx);});completed++;break;}}catch{await this.db.query("UPDATE publications SET last_error='DEPLOYMENT_VERIFICATION_PENDING' WHERE id=$1 AND status='prepared'",[id]);}}
    return completed;
  }
  async createRequest(input:unknown):Promise<{id:string}>{const parsed=z.object({kind:z.enum(['correction','contribution','privacy']),recordId:z.string().max(100).optional(),message:z.string().min(10).max(8000),contact:z.string().max(300).optional()}).strict().parse(input);const id=`req-${randomUUID()}`;await this.db.query('INSERT INTO requests(id,kind,record_id,message,contact) VALUES($1,$2,$3,$4,$5)',[id,parsed.kind,parsed.recordId??null,parsed.message,parsed.contact??null]);return{id};}
  async listRequests():Promise<Row[]>{return(await this.db.query('SELECT id,kind,record_id AS "recordId",message,contact,status,resolution,created_at AS "createdAt",updated_at AS "updatedAt" FROM requests ORDER BY created_at DESC LIMIT 500')).rows;}
  async updateRequest(id:string,input:unknown,actor='operator'):Promise<void>{const patch=z.object({status:z.enum(['open','reviewing','resolved','rejected']),resolution:z.string().max(4000).optional()}).strict().parse(input);await this.db.transaction(async(tx)=>{const r=await tx.query('UPDATE requests SET status=$2,resolution=$3,updated_at=now() WHERE id=$1 RETURNING id',[id,patch.status,patch.resolution??null]);if(!r.rowCount)throw new ArchiveError('REQUEST_NOT_FOUND','요청을 찾을 수 없습니다.',404);await this.audit('request.update',actor,id,{status:patch.status},tx);});}
  async overview():Promise<Row>{const sources=await this.listSources();const counts=(await this.db.query('SELECT status,count(*)::integer AS count FROM records GROUP BY status')).rows;const jobs=(await this.db.query('SELECT state,count(*)::integer AS count FROM jobs GROUP BY state')).rows;const oldest=(await this.db.query("SELECT min(created_at) AS at FROM jobs WHERE state IN ('queued','retry')")).rows[0]?.at;return{sources:sources.length,records:counts.reduce((n,r)=>n+Number(r.count),0),recordCounts:Object.fromEntries(counts.map(r=>[r.status,r.count])),jobCounts:Object.fromEntries(jobs.map(r=>[r.state,r.count])),oldestPendingAt:oldest?iso(oldest):null,lastCollectionAt:sources.map(s=>s.lastSuccessAt).filter(Boolean).sort().at(-1)??null,lastPublication:(await this.listPublications())[0]??null,sourceErrors:sources.filter(s=>s.lastError).length,remoteEnabled:Boolean(this.options.github)};}
}
export async function createArchiveService(options:ArchiveOptions):Promise<ArchiveService>{await mkdir(options.dataDir,{recursive:true});if(options.pglitePath&&!options.databaseUrl&&!options.pglitePath.startsWith('memory://'))await mkdir(resolve(options.pglitePath,'..'),{recursive:true});const db=await openDatabase(options);const service=new ArchiveService(db,options);await service.initialize();return service;}
