import { loadConfig } from '../src/config.js';
import { createArchiveService } from '../src/application/archive-service.js';
const config=loadConfig();
const approve=process.argv.includes('--approve-metadata-policy');
const service=await createArchiveService({databaseUrl:config.DATABASE_URL,pglitePath:config.pglitePath,dataDir:config.dataDir,exportDir:config.exportDir,publicSnapshotPath:config.publicSnapshotPath,autoPublish:false,collectionMaxItems:config.COLLECTION_MAX_ITEMS_PER_SOURCE});
try{
 const wars=[{id:'korean-war',name:'한국전쟁',aliases:['6·25전쟁','Korean War'],period:'1950–1953',summary:'한국전쟁 관련 기록을 연결하는 탐색 항목입니다. 개별 사건의 내용은 연결된 자료와 출처를 확인하세요.',sourceUrl:'https://www.archives.gov/research/military/korean-war',regions:['한반도']},{id:'world-war-i',name:'제1차 세계대전',aliases:['World War I','First World War'],period:'1914–1918',summary:'제1차 세계대전 관련 자료를 연결하는 탐색 항목입니다.',sourceUrl:'https://www.archives.gov/research/military/ww1',regions:['세계']},{id:'world-war-ii',name:'제2차 세계대전',aliases:['World War II','Second World War'],period:'1939–1945',summary:'제2차 세계대전 관련 자료를 연결하는 탐색 항목입니다.',sourceUrl:'https://www.archives.gov/research/military/ww2',regions:['세계']}];
 for(const war of wars)await service.upsertCatalog('war',war,'bootstrap');
 const existing=await service.listSources();
 for(const war of wars){const name=`Wikimedia Commons · ${war.name}`;let source=existing.find(s=>s.name===name);if(!source)source=await service.createSource({name,provider:'commons',query:`"${war.aliases.find(v=>/^[A-Z]/.test(v))}"`,warIds:[war.id],intervalSeconds:21600,policy:{status:approve?'approved':'unreviewed',allowAutoPublish:approve,metadataOnly:true,rightsLabel:'Wikimedia Commons 원 소장처의 자료별 이용 조건을 확인하세요. 메타데이터와 출처 링크 중심으로 제공합니다.',rightsUrl:'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia'}},'bootstrap-policy-review');else if(approve&&source.policy.status!=='approved')source=await service.updateSource(source.id,{policy:{...source.policy,status:'approved',allowAutoPublish:true}},'bootstrap-policy-review');await service.collectSource(source.id);}
 if(!existing.some(s=>s.provider==='loc'))await service.createSource({name:'Library of Congress · 한국전쟁',provider:'loc',query:'Korean War',warIds:['korean-war'],enabled:false,intervalSeconds:21600},'bootstrap');
 let processed=0;while(processed<500){const job=await service.runNextJob();if(!job)break;processed++;console.log(JSON.stringify({operation:'bootstrap.job',kind:job.kind,status:job.state,errorCode:job.lastError?.split(':')[0]}));}
 const publication=await service.publish({target:'local'});console.log(JSON.stringify({operation:'bootstrap.complete',processed,overview:await service.overview(),releaseId:publication.id,policyApproved:approve}));
}finally{await service.close();}
