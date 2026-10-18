import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectsCommand,type S3ClientConfig } from '@aws-sdk/client-s3';
import { ArchiveError } from '../domain/models.js';
import type { MediaAsset,ProducedFile,ProductionResult } from '../domain/models.js';
export type { MediaAsset,ProducedFile,ProductionResult } from '../domain/models.js';
import type { PublicRecord } from '../domain/contracts.js';
import { atomicJson, sha256, within } from './files.js';
import { lookup } from 'node:dns/promises';
import { isPublicAddress } from './collector.js';
sharp.cache({files:0});

export interface ObjectStorageOptions {endpoint?:string;region:string;bucket:string;accessKeyId:string;secretAccessKey:string;publicBaseUrl?:string;forcePathStyle?:boolean}
export interface CdnPurgeOptions {url:string;token:string}
export function validateOriginal(data:Buffer,declaredMime:string):string{
  if(!data.length||data.length>25_000_000)throw new ArchiveError('FILE_SIZE_INVALID','파일은 1바이트 이상 25MB 이하여야 합니다.');
  const begin=data.subarray(0,16),ascii=begin.toString('ascii');let detected:string|undefined;
  if(data.subarray(0,5).toString()==='%PDF-')detected='application/pdf';else if(begin.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))detected='image/png';else if(begin[0]===255&&begin[1]===216&&begin[2]===255)detected='image/jpeg';else if(ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP')detected='image/webp';else if(ascii.slice(4,8)==='ftyp')detected='video/mp4';else if(begin[0]===0x1a&&begin[1]===0x45&&begin[2]===0xdf&&begin[3]===0xa3)detected='video/webm';else if(ascii.startsWith('OggS'))detected='audio/ogg';else if(ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WAVE')detected='audio/wav';else if(ascii.startsWith('ID3')||(begin[0]===0xff&&(begin[1]!&0xe0)===0xe0))detected='audio/mpeg';
  else if(declaredMime==='text/plain'){try{const text=new TextDecoder('utf-8',{fatal:true}).decode(data);if([...text].some(c=>{const code=c.charCodeAt(0);return code<32&&code!==9&&code!==10&&code!==13;}))throw new Error();detected='text/plain';}catch{throw new ArchiveError('FILE_CONTENT_INVALID','UTF-8 텍스트 파일이 아닙니다.');}}
  if(!detected||detected!==declaredMime)throw new ArchiveError('FILE_MIME_MISMATCH','파일 내용과 선언된 MIME 형식이 다르거나 지원하지 않습니다.');return detected;
}
async function adapter(command:string,args:string[],timeout=45_000):Promise<string>{return new Promise((done,fail)=>{const child=spawn(command,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','ignore']});let stdout='',settled=false;const timer=setTimeout(()=>{child.kill('SIGKILL');if(!settled){settled=true;fail(new Error('ADAPTER_TIMEOUT'));}},timeout);child.stdout.on('data',(chunk:Buffer)=>{if(stdout.length+chunk.length>8_000_000){child.kill('SIGKILL');if(!settled){settled=true;clearTimeout(timer);fail(new Error('ADAPTER_OUTPUT_LIMIT'));}}else stdout+=chunk.toString('utf8');});child.once('error',()=>{if(!settled){settled=true;clearTimeout(timer);fail(new Error('ADAPTER_UNAVAILABLE'));}});child.once('exit',code=>{if(!settled){settled=true;clearTimeout(timer);if(code===0)done(stdout);else fail(new Error('ADAPTER_FAILED'));}});});}
async function produced(path:string,kind:ProducedFile['kind'],mimeType:string):Promise<ProducedFile>{const bytes=await readFile(path);return{kind,path,mimeType,sha256:sha256(bytes),sizeBytes:bytes.length};}
export async function produceArtifacts(record:PublicRecord,assets:MediaAsset[],dataDir:string):Promise<ProductionResult>{
  const folder=within(dataDir,'derivatives',record.id,`r${record.revision}-${randomUUID()}`);await mkdir(folder,{recursive:true,mode:0o700});
  const result:ProductionResult={files:[],steps:[]};
  const metadata=within(folder,'metadata.json');await atomicJson(metadata,record);result.files.push(await produced(metadata,'metadata','application/json'));
  const citation=within(folder,'citation.txt');await writeFile(citation,`${record.title}. ${record.source.name}. ${record.dates.display}. ${record.source.url}\n접근일: ${record.source.accessedAt}\n자료 식별자: ${record.source.identifier}\n이용 조건: ${record.rights.label}\n`);result.files.push(await produced(citation,'citation','text/plain'));result.steps.push({operation:'citation-and-metadata',status:'complete'});
  const sourceDescription=within(folder,'source-description.txt');await writeFile(sourceDescription,record.summary);result.files.push(await produced(sourceDescription,'text','text/plain'));
  for(const asset of assets){
    const prefix=asset.sha256.slice(0,16);
    const attempt=async(operation:string,action:()=>Promise<void>):Promise<void>=>{try{await action();result.steps.push({operation,status:'complete'});}catch(error){result.steps.push({operation,status:'unavailable',reason:error instanceof Error&&/^ADAPTER_/.test(error.message)?error.message:'PROCESSING_UNAVAILABLE'});}};
    if(asset.mimeType==='text/plain')await attempt('utf8-extraction',async()=>{const text=await readFile(asset.filePath,'utf8');result.text=text.slice(0,2_000_000);const path=within(folder,`${prefix}-text.txt`);await writeFile(path,result.text);result.files.push(await produced(path,'text','text/plain'));});
    else if(asset.mimeType==='application/pdf')await attempt('pdftotext',async()=>{const text=await adapter('pdftotext',['-layout',asset.filePath,'-']);result.text=text.slice(0,2_000_000);const path=within(folder,`${prefix}-text.txt`);await writeFile(path,result.text);result.files.push(await produced(path,'text','text/plain'));});
    else if(asset.mimeType.startsWith('image/')){
      await attempt('sharp-thumbnail',async()=>{const path=within(folder,`${prefix}-preview.webp`);await sharp(asset.filePath,{limitInputPixels:80_000_000,failOn:'warning'}).rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(path);result.files.push(await produced(path,'thumbnail','image/webp'));});
      await attempt('tesseract-ocr',async()=>{result.text=(await adapter('tesseract',[asset.filePath,'stdout','-l','eng'])).slice(0,2_000_000);const path=within(folder,`${prefix}-ocr.txt`);await writeFile(path,result.text);result.files.push(await produced(path,'text','text/plain'));});
    }else if(asset.mimeType.startsWith('video/')||asset.mimeType.startsWith('audio/')){
      await attempt('ffprobe',async()=>{const raw:unknown=JSON.parse(await adapter('ffprobe',['-v','error','-show_entries','format=duration','-of','json',asset.filePath]));if(raw&&typeof raw==='object'&&'format'in raw&&raw.format&&typeof raw.format==='object'&&'duration'in raw.format){const duration=Number(raw.format.duration);if(Number.isFinite(duration)&&duration>=0)result.durationSeconds=duration;}});
      if(asset.mimeType.startsWith('video/'))await attempt('ffmpeg-poster',async()=>{const path=within(folder,`${prefix}-poster.webp`);await adapter('ffmpeg',['-nostdin','-v','error','-y','-ss','0','-i',asset.filePath,'-frames:v','1','-vf','scale=1280:1280:force_original_aspect_ratio=decrease',path]);result.files.push(await produced(path,'thumbnail','image/webp'));});
      result.steps.push({operation:'speech-transcription',status:'not-requested'});
    }
  }
  if(!assets.length)result.steps.push({operation:'original-processing',status:'not-requested',reason:'METADATA_ONLY_SOURCE'});
  await atomicJson(within(folder,'production.json'),result);return result;
}
export async function uploadProducedFiles(recordId:string,files:ProducedFile[],options:ObjectStorageOptions,client?:S3Client):Promise<ProducedFile[]>{
  if(options.publicBaseUrl){const u=new URL(options.publicBaseUrl);if(u.protocol!=='https:'||u.username||u.password)throw new ArchiveError('STORAGE_URL_INVALID','공개 저장소 URL은 HTTPS여야 합니다.');}
  const config:S3ClientConfig={region:options.region,endpoint:options.endpoint,forcePathStyle:options.forcePathStyle??true,credentials:{accessKeyId:options.accessKeyId,secretAccessKey:options.secretAccessKey},maxAttempts:3,requestHandler:{requestTimeout:30_000,connectionTimeout:10_000}};
  const storage=client??new S3Client(config);const output:ProducedFile[]=[];
  try{for(const file of files){const size=(await stat(file.path)).size;if(size!==file.sizeBytes||sha256(await readFile(file.path))!==file.sha256)throw new ArchiveError('DERIVATIVE_INTEGRITY','제공용 파일 무결성 확인 실패',500);const key=`archive/${recordId}/${file.sha256}`;
    try{await storage.send(new PutObjectCommand({Bucket:options.bucket,Key:key,Body:await readFile(file.path),ContentType:file.mimeType,Metadata:{sha256:file.sha256},IfNoneMatch:'*',ChecksumSHA256:Buffer.from(file.sha256,'hex').toString('base64')}));}catch(error){if(!(error&&typeof error==='object'&&'$metadata'in error&&error.$metadata&&typeof error.$metadata==='object'&&'httpStatusCode'in error.$metadata&&error.$metadata.httpStatusCode===412))throw new ArchiveError('STORAGE_UPLOAD_FAILED','공개 저장소 전송 실패',502);}
    const head=await storage.send(new HeadObjectCommand({Bucket:options.bucket,Key:key}));if(head.ContentLength!==file.sizeBytes||head.Metadata?.sha256!==file.sha256)throw new ArchiveError('STORAGE_VERIFY_FAILED','공개 저장소 전송 검증 실패',502);output.push({...file,objectKey:key,...(options.publicBaseUrl?{url:`${options.publicBaseUrl.replace(/\/$/,'')}/${key}`}:{})});}
  }finally{if(!client)storage.destroy();}return output;
}
export async function removeProducedFiles(recordId:string,keys:string[],options:ObjectStorageOptions):Promise<number>{
  const allowed=[...new Set(keys)].filter(key=>key.startsWith(`archive/${recordId}/`)&&/^archive\/[\w-]+\/[a-f0-9]{64}$/.test(key));
  if(allowed.length!==new Set(keys).size)throw new ArchiveError('STORAGE_KEY_INVALID','철회할 공개 파일 경로가 허용되지 않았습니다.');
  const client=new S3Client({endpoint:options.endpoint,region:options.region,forcePathStyle:options.forcePathStyle??true,credentials:{accessKeyId:options.accessKeyId,secretAccessKey:options.secretAccessKey},maxAttempts:3,requestHandler:{requestTimeout:30_000,connectionTimeout:10_000}});
  try{for(let offset=0;offset<allowed.length;offset+=1000){const result=await client.send(new DeleteObjectsCommand({Bucket:options.bucket,Delete:{Objects:allowed.slice(offset,offset+1000).map(Key=>({Key})),Quiet:true}}));if(result.Errors?.length)throw new ArchiveError('STORAGE_DELETE_FAILED','공개 파일 철회 실패',502);}
    for(const key of allowed){let missing=false;try{await client.send(new HeadObjectCommand({Bucket:options.bucket,Key:key}));}catch(error){missing=Boolean(error&&typeof error==='object'&&'$metadata'in error&&error.$metadata&&typeof error.$metadata==='object'&&'httpStatusCode'in error.$metadata&&error.$metadata.httpStatusCode===404);if(!missing)throw new ArchiveError('STORAGE_DELETE_VERIFY_FAILED','공개 파일 철회 상태 확인 실패',502);}if(!missing)throw new ArchiveError('STORAGE_DELETE_VERIFY_FAILED','공개 파일이 아직 저장소에 존재합니다.',502);}return allowed.length;
  }finally{client.destroy();}
}
export async function purgePublicUrls(urls:string[],options:CdnPurgeOptions,fetcher:typeof fetch=fetch):Promise<void>{
  if(!/^https:\/\/api\.cloudflare\.com\/client\/v4\/zones\/[a-f0-9]{32}\/purge_cache\/?$/.test(options.url)||!options.token)throw new ArchiveError('CDN_CONFIG_INVALID','CDN 철회 설정을 확인하세요.');
  for(let offset=0;offset<urls.length;offset+=30){const response=await fetcher(options.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25_000),headers:{Authorization:`Bearer ${options.token}`,'Content-Type':'application/json'},body:JSON.stringify({files:urls.slice(offset,offset+30)})});if(!response.ok)throw new ArchiveError('CDN_PURGE_FAILED',`CDN 철회 요청 실패 (${response.status})`,502);const body:unknown=await response.json();if(!body||typeof body!=='object'||!('success'in body)||body.success!==true)throw new ArchiveError('CDN_PURGE_FAILED','CDN 철회 요청이 수락되지 않았습니다.',502);}
}
export async function verifyPublicRemoval(urls:string[],publicBaseUrl:string,fetcher:typeof fetch=fetch):Promise<void>{
  const base=new URL(publicBaseUrl);if(base.protocol!=='https:'||base.username||base.password)throw new ArchiveError('STORAGE_URL_INVALID','공개 저장소 URL을 확인하세요.');const addresses=await lookup(base.hostname,{all:true});if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new ArchiveError('STORAGE_URL_INVALID','공개 저장소 URL은 공개 네트워크여야 합니다.');
  for(const url of urls){if(!url.startsWith(publicBaseUrl.replace(/\/$/,'')+'/'))throw new ArchiveError('STORAGE_URL_INVALID','공개 파일 URL이 저장소 범위 밖에 있습니다.');const response=await fetcher(url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(15_000)});if(response.status!==404&&response.status!==410)throw new ArchiveError('PUBLIC_FILE_STILL_AVAILABLE','공개 URL 철회가 아직 확인되지 않았습니다.',502);}
}
