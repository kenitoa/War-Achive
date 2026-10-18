import { loadConfig } from '../config.js';
import { openDatabase } from '../infrastructure/database.js';
import { exportPortable } from '../infrastructure/portable.js';
const destination=process.argv[2];if(!destination)throw new Error('Usage: node dist/commands/export-portable.js <new-bundle-directory>');
const config=loadConfig(),db=await openDatabase({databaseUrl:config.DATABASE_URL,pglitePath:config.pglitePath});
try{const result=await exportPortable(db,config.dataDir,destination,{exportDir:config.exportDir});console.log(JSON.stringify({operation:'portable.export',status:'verified',formatVersion:result.version,tables:result.tables.map(t=>({name:t.name,rows:t.rows})),originals:result.originals.length,historicalFiles:result.preservedFiles.length,createdAt:result.createdAt}));}finally{await db.close();}
