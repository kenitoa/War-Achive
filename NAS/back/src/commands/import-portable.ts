import { resolve,sep } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { migrate,openDatabase } from '../infrastructure/database.js';
import { importPortable } from '../infrastructure/portable.js';
const bundle=process.argv[2],destination=process.argv[3];if(!bundle||!destination)throw new Error('Usage: node dist/commands/import-portable.js <bundle-directory> <new-empty-data-directory> [new-empty-release-directory]');
const config=loadConfig(),dataDir=resolve(destination);
// Source configuration must never silently select the source database for import.
const targetPglite=resolve(process.env.PGLITE_PATH||resolve(dataDir,'database'));
if(!config.DATABASE_URL&&!targetPglite.startsWith(dataDir+sep))throw new Error('PGLITE_PATH must be inside the new destination data directory');
if(!config.DATABASE_URL)await mkdir(resolve(targetPglite,'..'),{recursive:true});
const db=await openDatabase({databaseUrl:config.DATABASE_URL,pglitePath:targetPglite});
try{await migrate(db);const result=await importPortable(db,bundle,dataDir,{pglitePath:config.DATABASE_URL?undefined:targetPglite,exportDir:process.argv[4]?resolve(process.argv[4]):undefined});console.log(JSON.stringify({operation:'portable.import',status:'complete',...result}));}finally{await db.close();}
