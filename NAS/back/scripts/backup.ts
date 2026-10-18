import { resolve } from 'node:path';
import { loadConfig } from '../src/config.js';
import { createArchiveService } from '../src/application/archive-service.js';
import { backupArchive } from '../src/infrastructure/backup.js';
const target=process.argv[2];if(!target)throw new Error('Usage: npm run backup -- <new-backup-directory>');
const c=loadConfig();const service=await createArchiveService({databaseUrl:c.DATABASE_URL,pglitePath:c.pglitePath,dataDir:c.dataDir,exportDir:c.exportDir});
try{const manifest=await backupArchive(service,resolve(target));console.log(JSON.stringify({operation:'backup',status:'verified',databaseType:manifest.databaseType,originals:manifest.files.length,createdAt:manifest.createdAt}));}finally{await service.close();}
