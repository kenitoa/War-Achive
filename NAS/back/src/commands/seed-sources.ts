import { loadConfig } from '../config.js';
import { createArchiveService } from '../application/archive-service.js';
const config=loadConfig();
const service=await createArchiveService({databaseUrl:config.DATABASE_URL,pglitePath:config.pglitePath,dataDir:config.dataDir,exportDir:config.exportDir,autoPublish:false});
try{
  const wars=[{id:'world-war-i',name:'제1차 세계대전',query:'World War I',period:'1914–1918',regions:['세계'],sourceUrl:'https://www.archives.gov/research/military/ww1'},{id:'world-war-ii',name:'제2차 세계대전',query:'World War II',period:'1939–1945',regions:['세계'],sourceUrl:'https://www.archives.gov/research/military/ww2'},{id:'korean-war',name:'한국전쟁',query:'Korean War',period:'1950–1953',regions:['한반도'],sourceUrl:'https://www.archives.gov/research/military/korean-war'}];
  const existing=await service.listSources(),catalog=await service.listCatalog('war');let created=0;
  for(const war of wars){
    if(!catalog.some(item=>typeof item==='object'&&item!==null&&'id'in item&&item.id===war.id))await service.upsertCatalog('war',{id:war.id,name:war.name,aliases:[war.query],period:war.period,summary:`${war.name} 관련 소장 자료`,regions:war.regions,sourceUrl:war.sourceUrl},'installer');
    if(!existing.some(source=>source.provider==='commons'&&source.warIds.includes(war.id))){await service.createSource({name:`Wikimedia Commons · ${war.name}`,provider:'commons',query:`"${war.query}"`,warIds:[war.id],intervalSeconds:21600,enabled:true},'installer');created++;}
  }
  console.log(JSON.stringify({operation:'seed-sources',created,policyApprovalRequired:true}));
}finally{await service.close();}
