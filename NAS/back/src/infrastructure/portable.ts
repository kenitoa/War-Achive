import { createHash, randomUUID } from 'node:crypto';
import { access, copyFile, lstat, mkdir, open, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createReadStream,constants } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { Database, Executor } from './database.js';
import { sha256, within } from './files.js';
import { ArchiveError } from '../domain/models.js';

// Identifiers are code-owned, never interpolated from bundle contents.
const tables = {
  catalog: ['kind','id','data'],
  sources: ['id','data','next_run_at','updated_at'],
  members: ['id','email','display_name','password_hash','created_at','updated_at'],
  member_shelves: ['member_id','revision','document','updated_at'],
  raw_items: ['source_id','identifier','raw_hash','file_path','data','collected_at','ingest_sequence'],
  records: ['id','source_id','external_id','status','data','raw_hash','revision','updated_at'],
  record_versions: ['record_id','revision','data','created_at'],
  withdrawals: ['record_id','reason','withdrawn_at'],
  media_assets: ['id','record_id','sha256','mime_type','file_path','filename','size_bytes','rights_attestation','publish_derivatives','status','production','created_at','updated_at'],
  productions: ['id','record_id','revision','data','created_at'],
  publications: ['id','target','status','record_count','manifest','snapshot','created_at','published_at','last_error'],
  jobs: ['id','kind','state','payload','dedupe_key','attempts','max_attempts','run_at','lease_until','owner','last_error','created_at','updated_at'],
  requests: ['id','kind','record_id','message','contact','status','resolution','created_at','updated_at'],
  audit_log: ['id','operation','actor','resource_id','detail','created_at'],
} as const;
type Table = keyof typeof tables;
const names=Object.keys(tables) as Table[];
const excluded=['member_sessions','member_reset_tokens'] as const;
const jsonColumns=new Set(['data','document','production','manifest','snapshot','payload','detail']);
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
const ManifestSchema=z.object({
  format:z.literal('war-archive-portable'),version:z.literal(1),createdAt:z.iso.datetime(),
  migrations:z.array(z.object({version:z.string().regex(/^\d+.*\.sql$/),sha256:Hash,appliedAt:z.string()})),
  tables:z.array(z.object({name:z.enum(names),file:z.string().regex(/^[a-z_]+\.jsonl$/),sha256:Hash,rows:z.number().int().nonnegative()})),
  originals:z.array(z.object({kind:z.enum(['json','media']),sha256:Hash,file:z.string().regex(/^originals\/(json|media)\/[a-f0-9]{64}\.(json|bin)$/)})),
  exclusions:z.tuple([z.literal('member_sessions'),z.literal('member_reset_tokens')]),
}).strict();
export type PortableManifest=z.infer<typeof ManifestSchema>;

async function fileHash(path:string):Promise<string>{const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
async function freshDirectory(path:string):Promise<void>{try{await access(path);throw new ArchiveError('BUNDLE_TARGET_EXISTS','내보내기 대상 경로가 이미 존재합니다.',409);}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}await mkdir(path,{recursive:true,mode:0o700});}
async function migrationHistory(db:Executor):Promise<PortableManifest['migrations']>{const rows=(await db.query('SELECT version,applied_at FROM schema_migrations ORDER BY version')).rows;const out:PortableManifest['migrations']=[];for(const row of rows){const version=z.string().regex(/^\d+.*\.sql$/).parse(row.version);const bytes=await readFile(new URL(`../../migrations/${version}`,import.meta.url));out.push({version,sha256:sha256(bytes),appliedAt:row.applied_at instanceof Date?row.applied_at.toISOString():String(row.applied_at)});}return out;}
async function validateTables(db:Executor):Promise<void>{const actual=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows.map(row=>String(row.table_name));const allowed=new Set<string>([...names,...excluded,'schema_migrations','publication_guard']);if(actual.some(name=>!allowed.has(name))||[...allowed].some(name=>!actual.includes(name)))throw new ArchiveError('PORTABLE_SCHEMA_UNSUPPORTED','지원하는 마이그레이션과 테이블 구성을 확인하세요.',409);}
async function* rowsInFile(path:string):AsyncGenerator<Record<string,unknown>>{const input=createReadStream(path,{encoding:'utf8'}),lines=createInterface({input,crlfDelay:Infinity});try{for await(const line of lines){if(!line.trim())continue;const parsed:unknown=JSON.parse(line);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new ArchiveError('BUNDLE_ROW_INVALID','논리 백업 행 형식이 잘못되었습니다.');yield parsed as Record<string,unknown>;}}finally{lines.close();input.destroy();}}
function validateRow(table:Table,row:Record<string,unknown>):void{const expected:readonly string[]=tables[table];if(Object.keys(row).length!==expected.length||Object.keys(row).some(key=>!expected.includes(key)))throw new ArchiveError('BUNDLE_COLUMNS_INVALID','논리 백업 열 구성이 일치하지 않습니다.');}
function originalPath(dataDir:string,kind:'json'|'media',hash:string):string{return kind==='json'?within(dataDir,'originals',hash.slice(0,2),`${hash}.json`):within(dataDir,'originals','media',hash.slice(0,2),`${hash}.bin`);}

export async function exportPortable(db:Database,dataDir:string,destination:string):Promise<PortableManifest>{
  const root=resolve(destination);await freshDirectory(root);const sourceRoot=await realpath(dataDir);
  const manifest:PortableManifest={format:'war-archive-portable',version:1,createdAt:new Date().toISOString(),migrations:[],tables:[],originals:[],exclusions:[...excluded]};
  await db.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await validateTables(tx);manifest.migrations=await migrationHistory(tx);
    for(const table of names){
      const file=`${table}.jsonl`,target=await open(within(root,file),'wx',0o600),digest=createHash('sha256');let count=0;
      try{for(let offset=0;;offset+=500){const order=table==='raw_items'?'ingest_sequence':table==='catalog'?'kind,id':table==='member_shelves'?'member_id':table==='record_versions'?'record_id,revision':table==='withdrawals'?'record_id':'id';const rows=(await tx.query(`SELECT ${tables[table].join(',')} FROM ${table} ORDER BY ${order} LIMIT 500 OFFSET $1`,[offset])).rows;for(const row of rows){const line=JSON.stringify(row)+'\n';digest.update(line);await target.write(line);count++;}if(rows.length<500)break;}await target.sync();}finally{await target.close();}
      manifest.tables.push({name:table,file,sha256:digest.digest('hex'),rows:count});
    }
    const originals=(await tx.query("SELECT DISTINCT raw_hash AS hash,file_path,'json' AS kind FROM raw_items UNION ALL SELECT DISTINCT sha256 AS hash,file_path,'media' AS kind FROM media_assets")).rows;
    const copied=new Set<string>();
    for(const row of originals){const hash=Hash.parse(row.hash),kind=row.kind==='media'?'media':'json',key=`${kind}:${hash}`;if(copied.has(key))continue;const source=await realpath(String(row.file_path));if(source!==sourceRoot&&!source.startsWith(sourceRoot+sep))throw new ArchiveError('ORIGINAL_PATH_INVALID','보존 원본이 지정한 데이터 경로 밖에 있습니다.');if(await fileHash(source)!==hash)throw new ArchiveError('ORIGINAL_INTEGRITY','보존 원본의 해시가 일치하지 않습니다.');const file=`originals/${kind}/${hash}.${kind==='json'?'json':'bin'}`;await mkdir(dirname(within(root,file)),{recursive:true,mode:0o700});await copyFile(source,within(root,file));if(await fileHash(within(root,file))!==hash)throw new ArchiveError('BUNDLE_COPY_FAILED','내보낸 원본의 해시가 일치하지 않습니다.');manifest.originals.push({kind,sha256:hash,file});copied.add(key);}
  });
  await writeFile(within(root,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
  await verifyPortable(root);return manifest;
}

export async function verifyPortable(bundleDir:string):Promise<PortableManifest>{
  const root=resolve(bundleDir),manifest=ManifestSchema.parse(JSON.parse(await readFile(within(root,'manifest.json'),'utf8'))as unknown);
  if(manifest.tables.length!==names.length||new Set(manifest.tables.map(t=>t.name)).size!==names.length)throw new ArchiveError('BUNDLE_TABLES_INVALID','논리 백업 테이블 목록이 불완전합니다.');
  const rootReal=await realpath(root);
  for(const table of manifest.tables){if(table.file!==`${table.name}.jsonl`)throw new ArchiveError('BUNDLE_PATH_INVALID','테이블 파일 이름이 일치하지 않습니다.');const path=await realpath(within(root,table.file));if(!path.startsWith(rootReal+sep)||await fileHash(path)!==table.sha256)throw new ArchiveError('BUNDLE_INTEGRITY','논리 백업 파일이 변조되었거나 손상되었습니다.');let count=0;for await(const row of rowsInFile(path)){validateRow(table.name,row);count++;}if(count!==table.rows)throw new ArchiveError('BUNDLE_ROW_COUNT','논리 백업 행 수가 일치하지 않습니다.');}
  const originals=new Set<string>();for(const file of manifest.originals){const key=`${file.kind}:${file.sha256}`;if(originals.has(key))throw new ArchiveError('BUNDLE_ORIGINAL_DUPLICATE','원본 목록이 중복되었습니다.');originals.add(key);const expected=`originals/${file.kind}/${file.sha256}.${file.kind==='json'?'json':'bin'}`;if(file.file!==expected)throw new ArchiveError('BUNDLE_PATH_INVALID','원본 파일 경로가 일치하지 않습니다.');const path=await realpath(within(root,file.file));if(!path.startsWith(rootReal+sep)||await fileHash(path)!==file.sha256)throw new ArchiveError('BUNDLE_INTEGRITY','보존 원본이 변조되었거나 손상되었습니다.');}
  for(const table of ['raw_items','media_assets']as const){for await(const row of rowsInFile(within(root,`${table}.jsonl`))){const hash=Hash.parse(row[table==='raw_items'?'raw_hash':'sha256']);if(!originals.has(`${table==='raw_items'?'json':'media'}:${hash}`))throw new ArchiveError('BUNDLE_ORIGINAL_MISSING','DB에서 참조한 원본 파일이 없습니다.');}}
  return manifest;
}

async function validateTargetDirectory(dataDir:string,pglitePath?:string):Promise<void>{
  try{const metadata=await lstat(dataDir);if(!metadata.isDirectory()||metadata.isSymbolicLink())throw new ArchiveError('IMPORT_TARGET_INVALID','새 데이터 디렉터리가 필요합니다.');const entries=await readdir(dataDir);const permitted=pglitePath?relative(resolve(dataDir),resolve(pglitePath)):undefined;if(entries.some(name=>!permitted||name!==permitted||permitted.includes(sep)||permitted==='..'))throw new ArchiveError('IMPORT_TARGET_NOT_EMPTY','가져오기 대상 데이터 디렉터리가 비어 있지 않습니다.',409);}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
}
function relocateProduction(value:unknown,dataDir:string):unknown{if(!value||typeof value!=='object'||!('files'in value)||!Array.isArray(value.files))return value;return{...value,files:value.files.map((file:unknown)=>file&&typeof file==='object'&&'sha256'in file&&typeof file.sha256==='string'?{...file,path:within(dataDir,'derivatives','regenerate',Hash.parse(file.sha256))}:file)};}
function prepareRow(table:Table,input:Record<string,unknown>,dataDir:string,at:string):Record<string,unknown>{
  const row={...input};
  if(table==='raw_items')row.file_path=originalPath(dataDir,'json',Hash.parse(row.raw_hash));
  if(table==='media_assets'){row.file_path=originalPath(dataDir,'media',Hash.parse(row.sha256));row.production=null;row.status='queued';}
  if(table==='productions')row.data=relocateProduction(row.data,dataDir);
  if(table==='jobs'&&['queued','retry','running'].includes(String(row.state))){row.state='queued';row.owner=null;row.lease_until=null;row.attempts=0;row.run_at=at;row.last_error='PORTABLE_IMPORT_REQUEUED';row.updated_at=at;}
  return row;
}
export async function importPortable(db:Database,bundleDir:string,dataDir:string,options:{pglitePath?:string}={}):Promise<{records:number;sources:number;originals:number;invalidatedSessions:true}>{
  const root=resolve(bundleDir),destination=resolve(dataDir),manifest=await verifyPortable(root);
  const targetHistory=await migrationHistory(db);if(JSON.stringify(targetHistory.map(({version,sha256})=>({version,sha256})))!==JSON.stringify(manifest.migrations.map(({version,sha256})=>({version,sha256}))))throw new ArchiveError('IMPORT_MIGRATIONS_MISMATCH','원본과 대상의 마이그레이션 버전 및 파일 해시가 일치해야 합니다.',409);
  await validateTables(db);await validateTargetDirectory(destination,options.pglitePath);
  const at=new Date().toISOString();
  await db.transaction(async tx=>{
    await tx.query(`LOCK TABLE ${[...names,...excluded].join(',')} IN ACCESS EXCLUSIVE MODE`);
    for(const table of [...names,...excluded])if(Number((await tx.query(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n??0)>0)throw new ArchiveError('IMPORT_DATABASE_NOT_EMPTY','가져오기는 마이그레이션만 적용한 새 빈 DB에서 실행해야 합니다.',409);
    await mkdir(destination,{recursive:true,mode:0o700});
    for(const file of manifest.originals){const path=originalPath(destination,file.kind,file.sha256);await mkdir(dirname(path),{recursive:true,mode:0o700});await copyFile(within(root,file.file),path,constants.COPYFILE_EXCL);if(await fileHash(path)!==file.sha256)throw new ArchiveError('IMPORT_ORIGINAL_INTEGRITY','복원 원본의 해시가 일치하지 않습니다.');}
    for(const table of names){for await(const input of rowsInFile(within(root,`${table}.jsonl`))){const row=prepareRow(table,input,destination,at);const columns:readonly string[]=tables[table];const values=columns.map(column=>jsonColumns.has(column)&&row[column]!==null?JSON.stringify(row[column]):row[column]);await tx.query(`INSERT INTO ${table}(${columns.join(',')})${table==='raw_items'?' OVERRIDING SYSTEM VALUE':''} VALUES(${columns.map((_,i)=>`$${i+1}`).join(',')})`,values);}}
    await tx.query("SELECT setval(pg_get_serial_sequence('raw_items','ingest_sequence'),COALESCE(max(ingest_sequence),1),count(*)>0) FROM raw_items");
    const records=await tx.query("SELECT id AS record_id FROM records WHERE status<>'withdrawn'");
    for(const record of records.rows)await tx.query("INSERT INTO jobs(id,kind,payload,dedupe_key) VALUES($1,'produce',$2,$3) ON CONFLICT DO NOTHING",[`job-${randomUUID()}`,JSON.stringify({recordId:record.record_id}),`produce:portable:${String(record.record_id)}`]);
    await tx.query('INSERT INTO audit_log(id,operation,actor,detail) VALUES($1,$2,$3,$4)',[randomUUID(),'portable.import','operator',JSON.stringify({bundleCreatedAt:manifest.createdAt,originals:manifest.originals.length,sessionsInvalidated:true,sourceMigrations:manifest.migrations.map(m=>m.version)})]);
  });
  await writeFile(within(destination,'portable-import.json'),JSON.stringify({completedAt:at,bundleCreatedAt:manifest.createdAt,originals:manifest.originals.length,sessionsInvalidated:true}),{flag:'wx',mode:0o600});
  return{records:manifest.tables.find(t=>t.name==='records')!.rows,sources:manifest.tables.find(t=>t.name==='sources')!.rows,originals:manifest.originals.length,invalidatedSessions:true};
}
