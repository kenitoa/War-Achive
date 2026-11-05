import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Database, Executor } from '../infrastructure/database.js';
import { atomicJson, sha256, within } from '../infrastructure/files.js';
import { ArchiveError, ArchiveRecordSchema, SourceSchema, type ArchiveRecord } from '../domain/models.js';
import { analyseRecords, CreateArticleSchema, DecisionSchema, DocumentSchema, EditArticleSchema, EditorialStatus, validateEvidence, type EditorialArticle, type EditorialDocument } from '../domain/editorial.js';

const iso=(value:unknown):string=>value instanceof Date?value.toISOString():String(value);
function article(row:Record<string,unknown>):EditorialArticle {
  return {id:String(row.id),slug:String(row.slug),status:EditorialStatus.parse(row.status),revision:Number(row.revision),document:DocumentSchema.parse(row.document),attempts:Number(row.attempts),lastError:row.last_error?String(row.last_error):null,runAt:iso(row.run_at),updatedAt:iso(row.updated_at)};
}
export class EditorialService {
  readonly owner=randomUUID();
  constructor(readonly db:Database,readonly exportDir:string) {}
  private async audit(tx:Executor,operation:string,actor:string,id:string,detail:Record<string,unknown>={}):Promise<void>{
    await tx.query('INSERT INTO audit_log(id,operation,actor,resource_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),`editorial.${operation}`,actor,id,JSON.stringify(detail)]);
  }
  private async version(tx:Executor,item:EditorialArticle,actor:string):Promise<void>{
    await tx.query('INSERT INTO editorial_versions(article_id,revision,document,status,actor) VALUES($1,$2,$3,$4,$5)',[item.id,item.revision,JSON.stringify(item.document),item.status,actor]);
  }
  private async records(tx:Executor,ids:string[],lock=false):Promise<ArchiveRecord[]> {
    const rows=await tx.query(`SELECT data FROM records WHERE id=ANY($1::text[]) ORDER BY id${lock?' FOR UPDATE':''}`,[ids]);
    if(rows.rows.length!==ids.length)throw new ArchiveError('EVIDENCE_MISSING','근거 자료를 모두 찾을 수 없습니다.',409);
    return rows.rows.map(row=>ArchiveRecordSchema.parse(row.data));
  }
  private async eligible(tx:Executor,records:ArchiveRecord[]):Promise<boolean>{
    if(records.some(record=>record.status!=='published'||record.sourceAvailability==='unavailable'||record.public.sensitivity!=='none'||record.public.review.provenance!=='checked'))return false;
    if((await tx.query('SELECT record_id FROM withdrawals WHERE record_id=ANY($1::text[])',[records.map(r=>r.id)])).rows.length)return false;
    const sources=await tx.query('SELECT data FROM sources WHERE id=ANY($1::text[])',[[...new Set(records.map(r=>r.sourceId))]]);
    return sources.rows.every(row=>SourceSchema.parse(row.data).policy.status==='approved') && sources.rows.length===new Set(records.map(r=>r.sourceId)).size;
  }
  private async current(tx:Executor,document:EditorialDocument,lock=false):Promise<boolean>{
    const ids=document.evidence.map(e=>e.recordId);
    const count=await tx.query('SELECT id FROM records WHERE id=ANY($1::text[])',[ids]);
    if(count.rows.length!==ids.length)return false;
    const records=await this.records(tx,ids,lock);
    return await this.eligible(tx,records) && records.every(record=>document.evidence.some(e=>e.recordId===record.id&&e.revision===record.public.revision));
  }
  async create(input:unknown,actor='operator',automaticKey?:string):Promise<EditorialArticle|null>{
    const parsed=CreateArticleSchema.parse(input);
    return this.db.transaction(async tx=>{
      await tx.query('SELECT id FROM publication_guard WHERE id=1 FOR UPDATE');
      const records=await this.records(tx,parsed.recordIds,true);
      if(!await this.eligible(tx,records))throw new ArchiveError('EVIDENCE_NOT_APPROVED','공개 승인된 비민감 자료만 원고의 근거로 선택하세요.',409);
      const document=analyseRecords(records,parsed.title),id=`post-${randomUUID()}`;
      const inserted=await tx.query("INSERT INTO editorial_articles(id,slug,status,document,automatic_key) VALUES($1,$2,'review',$3,$4) ON CONFLICT(automatic_key) DO NOTHING RETURNING *",[id,id,JSON.stringify(document),automaticKey??null]);
      if(!inserted.rows[0])return null;
      const value=article(inserted.rows[0]);await this.version(tx,value,actor);await this.audit(tx,'draft-created',actor,id,{recordIds:parsed.recordIds,method:document.analysis.method});return value;
    });
  }
  async list(page=1,pageSize=20):Promise<{items:EditorialArticle[];total:number;page:number;pages:number;counts:Record<string,number>}>{
    return this.db.transaction(async tx=>{
      const counts=await tx.query('SELECT status,count(*)::integer AS n FROM editorial_articles GROUP BY status');
      const total=counts.rows.reduce((sum,row)=>sum+Number(row.n),0),pages=Math.max(1,Math.ceil(total/pageSize)),actual=Math.min(page,pages);
      const rows=await tx.query('SELECT * FROM editorial_articles ORDER BY created_at DESC,id LIMIT $1 OFFSET $2',[pageSize,(actual-1)*pageSize]);
      return{items:rows.rows.map(article),total,page:actual,pages,counts:Object.fromEntries(counts.rows.map(row=>[String(row.status),Number(row.n)]))};
    });
  }
  async get(id:string,tx:Executor=this.db,lock=false):Promise<EditorialArticle>{
    const row=(await tx.query(`SELECT * FROM editorial_articles WHERE id=$1${lock?' FOR UPDATE':''}`,[id])).rows[0];
    if(!row)throw new ArchiveError('ARTICLE_NOT_FOUND','원고를 찾을 수 없습니다.',404);return article(row);
  }
  async history(id:string):Promise<Record<string,unknown>[]>{return(await this.db.query('SELECT revision,document,status,actor,created_at FROM editorial_versions WHERE article_id=$1 ORDER BY revision DESC LIMIT 100',[id])).rows;}
  async edit(id:string,input:unknown,actor:string):Promise<EditorialArticle>{
    const parsed=EditArticleSchema.parse(input);
    return this.db.transaction(async tx=>{
      await tx.query('SELECT id FROM publication_guard WHERE id=1 FOR UPDATE');const old=await this.get(id,tx,true);
      if(old.revision!==parsed.expectedRevision)throw new ArchiveError('REVISION_CONFLICT','원고가 변경되었습니다. 새로고침하세요.',409);
      if(old.status==='publishing')throw new ArchiveError('ARTICLE_BUSY','발행 작업이 끝난 뒤 편집하세요.',409);
      const document=DocumentSchema.parse({...old.document,...parsed,approval:undefined});
      if(!validateEvidence(document))throw new ArchiveError('EVIDENCE_INVALID','모든 문단과 근거 자료를 서로 연결하세요.');
      await tx.query("UPDATE editorial_articles SET document=$2,status='review',revision=revision+1,attempts=0,last_error=null,owner=null,lease_until=null,updated_at=now() WHERE id=$1",[id,JSON.stringify(document)]);
      const result=await this.get(id,tx);await this.version(tx,result,actor);await this.audit(tx,'edited',actor,id);return result;
    });
  }
  async decide(id:string,input:unknown,actor:string):Promise<EditorialArticle>{
    const parsed=DecisionSchema.parse(input);
    return this.db.transaction(async tx=>{
      await tx.query('SELECT id FROM publication_guard WHERE id=1 FOR UPDATE');const old=await this.get(id,tx,true);
      if(old.revision!==parsed.expectedRevision)throw new ArchiveError('REVISION_CONFLICT','원고가 변경되었습니다. 새로고침하세요.',409);
      let status:EditorialArticle['status']='draft';let document=old.document;
      if(parsed.decision==='approve'){
        if(!['review','draft'].includes(old.status))throw new ArchiveError('ARTICLE_STATE','검토 중인 원고만 승인할 수 있습니다.',409);
        if(!parsed.contentReviewed||!parsed.rightsReviewed||!validateEvidence(document))throw new ArchiveError('REVIEW_REQUIRED','문단별 근거와 내용·권리 검수를 완료하세요.',409);
        if(!await this.current(tx,document,true))throw new ArchiveError('EVIDENCE_STALE','근거 자료가 변경되거나 공개 조건을 충족하지 않습니다.',409);
        document={...document,approval:{contentReviewed:true,rightsReviewed:true,actor,at:new Date().toISOString()}};
        status=parsed.publishAt&&Date.parse(parsed.publishAt)>Date.now()?'scheduled':'approved';
      }else if(parsed.decision==='retry'){
        if(old.status!=='failed'||!document.approval||!await this.current(tx,document,true))throw new ArchiveError('ARTICLE_STATE','실패한 승인 원고만 재시도할 수 있습니다.',409);status='approved';
      }else if(parsed.decision==='withdraw')status='withdrawn';
      else {if(old.status==='publishing')throw new ArchiveError('ARTICLE_BUSY','발행 중에는 철회하거나 완료 후 편집하세요.',409);document={...document,approval:undefined};}
      await tx.query('UPDATE editorial_articles SET status=$2,document=$3,revision=revision+1,run_at=$4,attempts=0,last_error=null,owner=null,lease_until=null,updated_at=now() WHERE id=$1',[id,status,JSON.stringify(document),status==='scheduled'?parsed.publishAt:new Date().toISOString()]);
      const result=await this.get(id,tx);await this.version(tx,result,actor);await this.audit(tx,parsed.decision,actor,id,{note:parsed.note,publishAt:parsed.publishAt??null});return result;
    });
  }
  async discover(limit=5):Promise<number>{
    const rows=await this.db.query("SELECT r.data FROM records r JOIN sources s ON s.id=r.source_id WHERE r.status='published' AND r.data->>'sourceAvailability' IS DISTINCT FROM 'unavailable' AND r.data->'public'->>'sensitivity'='none' AND r.data->'public'->'review'->>'provenance'='checked' AND s.data->'policy'->>'status'='approved' AND NOT EXISTS(SELECT 1 FROM editorial_articles a WHERE a.automatic_key=r.id||':'||r.revision::text) ORDER BY r.id LIMIT $1",[limit]);let made=0;
    for(const row of rows.rows){const record=ArchiveRecordSchema.parse(row.data);try{if(await this.create({recordIds:[record.id]},'worker',`${record.id}:${record.public.revision}`))made++;}catch(error){if(!(error instanceof ArchiveError&&error.code==='EVIDENCE_NOT_APPROVED'))throw error;}}
    return made;
  }
  async reconcile(limit=50):Promise<number>{
    return this.db.transaction(async tx=>{
      await tx.query('SELECT id FROM publication_guard WHERE id=1 FOR UPDATE');
      const rows=await tx.query("SELECT * FROM editorial_articles WHERE status IN ('approved','scheduled','published','publishing') ORDER BY updated_at,id LIMIT $1 FOR UPDATE",[limit]);let changed=0;
      for(const row of rows.rows){const old=article(row);if(!await this.current(tx,old.document,true)){
        const document={...old.document,approval:undefined};await tx.query("UPDATE editorial_articles SET status='review',document=$2,revision=revision+1,owner=null,lease_until=null,last_error='EVIDENCE_STALE',updated_at=now() WHERE id=$1",[old.id,JSON.stringify(document)]);await this.version(tx,await this.get(old.id,tx),'worker');await this.audit(tx,'evidence-invalidated','worker',old.id);changed++;
      }else await tx.query('UPDATE editorial_articles SET updated_at=now() WHERE id=$1',[old.id]);}
      return changed;
    });
  }
  async publishNext():Promise<boolean>{
    const claimed=await this.db.transaction(async tx=>{
      await tx.query("UPDATE editorial_articles SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'approved' END,owner=null,lease_until=null,last_error='LEASE_EXPIRED',updated_at=now() WHERE status='publishing' AND lease_until<now()");
      const row=(await tx.query("SELECT * FROM editorial_articles WHERE status IN ('approved','scheduled') AND run_at<=now() ORDER BY run_at,id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!row)return null;
      return article((await tx.query("UPDATE editorial_articles SET status='publishing',owner=$2,lease_until=now()+interval '3 minutes',attempts=attempts+1,updated_at=now() WHERE id=$1 RETURNING *",[row.id,this.owner])).rows[0]!);
    });
    if(!claimed)return false;
    try{
      if(!claimed.document.approval||!validateEvidence(claimed.document))throw new ArchiveError('REVIEW_REQUIRED','승인된 원고가 아닙니다.',409);
      const folder=within(this.exportDir,'blog',claimed.id,`r${claimed.revision}`),snapshot={id:claimed.id,slug:claimed.slug,revision:claimed.revision,document:claimed.document};
      await atomicJson(resolve(folder,'article.json'),snapshot);
      const loaded:unknown=JSON.parse(await readFile(resolve(folder,'article.json'),'utf8'));
      if(sha256(JSON.stringify(loaded))!==sha256(JSON.stringify(snapshot)))throw new ArchiveError('BLOG_VERIFY_FAILED','발행 파일 무결성을 확인하지 못했습니다.',500);
      await this.db.transaction(async tx=>{
        await tx.query('SELECT id FROM publication_guard WHERE id=1 FOR UPDATE');
        const lease=await tx.query("SELECT id FROM editorial_articles WHERE id=$1 AND revision=$2 AND owner=$3 AND status='publishing' AND lease_until>now() FOR UPDATE",[claimed.id,claimed.revision,this.owner]);
        if(!lease.rows.length)throw new ArchiveError('LEASE_LOST','원고 발행 권한이 만료되었습니다.',409);
        if(!await this.current(tx,claimed.document,true))throw new ArchiveError('EVIDENCE_STALE','발행 전 근거 변경이 확인되었습니다.',409);
        await tx.query('INSERT INTO blog_publications(article_id,revision,slug,document,sha256) VALUES($1,$2,$3,$4,$5) ON CONFLICT(article_id,revision) DO NOTHING',[claimed.id,claimed.revision,claimed.slug,JSON.stringify(claimed.document),sha256(JSON.stringify(claimed.document))]);
        await tx.query("UPDATE editorial_articles SET status='published',owner=null,lease_until=null,last_error=null,updated_at=now() WHERE id=$1",[claimed.id]);
        await this.audit(tx,'published','worker',claimed.id,{revision:claimed.revision,sha256:sha256(JSON.stringify(claimed.document))});
      });
    }catch(error){const code=error instanceof ArchiveError?error.code:'BLOG_PUBLICATION_FAILED';
      await this.db.transaction(async tx=>{
        const review=['EVIDENCE_STALE','REVIEW_REQUIRED'].includes(code);
        const result=await tx.query("UPDATE editorial_articles SET status=$4,owner=null,lease_until=null,last_error=$5,run_at=now()+($6::text||' seconds')::interval,updated_at=now() WHERE id=$1 AND revision=$2 AND owner=$3 AND status='publishing' RETURNING id",[claimed.id,claimed.revision,this.owner,review?'review':claimed.attempts>=5?'failed':'approved',code,Math.min(3600,15*2**claimed.attempts)]);
        if(result.rows.length){
          if(review){await tx.query("UPDATE editorial_articles SET document=document-'approval',revision=revision+1 WHERE id=$1",[claimed.id]);await this.version(tx,await this.get(claimed.id,tx),'worker');}
          await this.audit(tx,'publication-failed','worker',claimed.id,{code});
        }
      });
    }return true;
  }
  async published(page=1,pageSize=12,slug?:string):Promise<{items:EditorialArticle[];total:number;pages:number;page:number}>{
    // Evidence joins are part of the read boundary: withdrawal is immediate even before the next worker tick.
    const predicate=`a.status='published' AND p.revision=a.revision AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.document->'evidence') e LEFT JOIN records r ON r.id=e->>'recordId' LEFT JOIN sources s ON s.id=r.source_id WHERE r.id IS NULL OR r.status<>'published' OR r.data->>'sourceAvailability'='unavailable' OR r.revision<>(e->>'revision')::integer OR r.data->'public'->>'sensitivity' IS DISTINCT FROM 'none' OR r.data->'public'->'review'->>'provenance' IS DISTINCT FROM 'checked' OR s.data->'policy'->>'status' IS DISTINCT FROM 'approved' OR EXISTS(SELECT 1 FROM withdrawals w WHERE w.record_id=r.id))`;
    return this.db.transaction(async tx=>{
      const filter=slug?' AND p.slug=$1':'',args=slug?[slug]:[];
      const total=Number((await tx.query(`SELECT count(*)::integer AS n FROM blog_publications p JOIN editorial_articles a ON a.id=p.article_id WHERE ${predicate}${filter}`,args)).rows[0]?.n??0),pages=Math.max(1,Math.ceil(total/pageSize)),actual=Math.min(page,pages);
      const rows=await tx.query(`SELECT a.* FROM blog_publications p JOIN editorial_articles a ON a.id=p.article_id WHERE ${predicate}${filter} ORDER BY p.published_at DESC,a.id LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,pageSize,(actual-1)*pageSize]);
      return{items:rows.rows.map(article),total,pages,page:actual};
    });
  }
}
export const EditorialPageSchema=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20)}).strict();
