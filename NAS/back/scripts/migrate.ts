import { loadConfig } from '../src/config.js';
import { createArchiveService } from '../src/application/archive-service.js';
const config=loadConfig();
const service=await createArchiveService({databaseUrl:config.DATABASE_URL,pglitePath:config.pglitePath,dataDir:config.dataDir,exportDir:config.exportDir});
console.log(JSON.stringify({operation:'migrations',status:'complete',versions:(await service.db.query('SELECT version FROM schema_migrations ORDER BY version')).rows}));
await service.close();
