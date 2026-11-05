import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config.js';
import { openDatabase } from '../infrastructure/database.js';
import { atomicJson } from '../infrastructure/files.js';

const run=promisify(execFile),checks:{name:string;ok:boolean}[]=[];
const config=loadConfig();
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 or later is required.');
for(const [name,args] of [['tesseract',['--version']],['pdftotext',['-v']],['ffmpeg',['-version']],['ffprobe',['-version']],['git',['--version']],['ssh',['-V']],['pg_dump',['--version']],['pg_restore',['--version']]] as const){
  try{await run(name,[...args],{timeout:10000,windowsHide:true});checks.push({name,ok:true});}catch{checks.push({name,ok:false});}
}
try{const langs=await run('tesseract',['--list-langs'],{timeout:10000,windowsHide:true});checks.push({name:'ocr-eng-kor',ok:/\beng\b/.test(langs.stdout)&&/\bkor\b/.test(langs.stdout)});}catch{checks.push({name:'ocr-eng-kor',ok:false});}
for(const folder of [config.dataDir,config.exportDir]){
  await mkdir(folder,{recursive:true});await access(folder,constants.R_OK|constants.W_OK);
  const target=resolve(folder,`.preflight-${randomUUID()}.json`);
  try{await atomicJson(target,{probe:true});checks.push({name:folder===config.dataDir?'data-storage':'export-storage',ok:JSON.parse(await readFile(target,'utf8')).probe===true});}finally{await unlink(target).catch(()=>undefined);}
}
if(!process.argv.includes('--configuration-only')){
  const db=await openDatabase({databaseUrl:config.DATABASE_URL,pglitePath:config.pglitePath});
  try{await db.query('SELECT 1');const migration=await db.query("SELECT version FROM schema_migrations WHERE version='007_editorial_pipeline.sql'");checks.push({name:'editorial-schema',ok:migration.rows.length===1});}finally{await db.close();}
}
console.log(JSON.stringify({operation:'preflight',checks,editorialEnabled:config.EDITORIAL_PIPELINE_ENABLED==='true',autoDraftEnabled:config.EDITORIAL_AUTO_DRAFT_ENABLED==='true',blogApprovalRequired:true}));
if(checks.some(check=>!check.ok))process.exitCode=1;
