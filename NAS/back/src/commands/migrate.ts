import { loadConfig } from '../config.js';
import { migrate, openDatabase } from '../infrastructure/database.js';

const config = loadConfig();
const database = await openDatabase({ databaseUrl: config.DATABASE_URL, pglitePath: config.pglitePath });
try {
  await migrate(database);
  console.log(JSON.stringify({ operation: 'migrations', status: 'complete', versions: (await database.query('SELECT version FROM schema_migrations ORDER BY version')).rows }));
} finally { await database.close(); }
