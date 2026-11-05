import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig } from '../config.js';
import { createArchiveService } from '../application/archive-service.js';
import { atomicJson } from '../infrastructure/files.js';
import { resolve } from 'node:path';

const config=loadConfig();
const service=await createArchiveService({databaseUrl:config.DATABASE_URL,pglitePath:config.pglitePath,dataDir:config.dataDir,exportDir:config.exportDir,publicSnapshotPath:config.publicSnapshotPath,github:config.github,autoPublish:config.AUTO_PUBLISH_ENABLED==='true',publicationIntervalSeconds:Math.ceil(config.PUBLICATION_INTERVAL_MS/1000),collectionMaxItems:config.COLLECTION_MAX_ITEMS_PER_SOURCE,objectStorage:config.objectStorage,cdnPurge:config.cdnPurge});
let stopping=false;
process.once('SIGINT',()=>{stopping=true;});process.once('SIGTERM',()=>{stopping=true;});
let lastSchedule=0;
let lastHeartbeat=0;
let lastEditorial=0;
try{
  console.log(JSON.stringify({timestamp:new Date().toISOString(),level:'info',service:'archive-worker',operation:'start',database:config.DATABASE_URL?'postgresql':'pglite'}));
  while(!stopping){
    try{
      if(Date.now()-lastHeartbeat>30_000){await atomicJson(resolve(config.dataDir,'worker-heartbeat.json'),{at:new Date().toISOString(),workerId:service.workerId});lastHeartbeat=Date.now();}
      if(Date.now()-lastSchedule>=config.COLLECTION_INTERVAL_MS){await service.scheduleDueSources();await service.verifyPendingPublications();lastSchedule=Date.now();}
      if(config.EDITORIAL_PIPELINE_ENABLED==='true'&&Date.now()-lastEditorial>=5000){
        lastEditorial=Date.now();
        try{
          await service.editorial.reconcile();
          if(config.EDITORIAL_AUTO_DRAFT_ENABLED==='true')await service.editorial.discover(config.EDITORIAL_BATCH_SIZE);
          await service.editorial.publishNext();
        }catch{console.error(JSON.stringify({timestamp:new Date().toISOString(),level:'error',service:'archive-worker',operation:'editorial',errorCode:'EDITORIAL_CYCLE_FAILED'}));}
      }
      const job=await service.runNextJob();
      if(job)console.log(JSON.stringify({timestamp:new Date().toISOString(),level:job.state==='done'?'info':'warn',service:'archive-worker',operation:job.kind,jobId:job.id,status:job.state,errorCode:job.lastError?.split(':')[0]}));
      else await delay(Math.min(config.SCHEDULER_RETRY_MS,1000));
    }catch{console.error(JSON.stringify({timestamp:new Date().toISOString(),level:'error',service:'archive-worker',operation:'loop',errorCode:'WORKER_LOOP_FAILED'}));await delay(Math.min(config.SCHEDULER_RETRY_MS,5000));}
  }
}finally{await service.close();}
