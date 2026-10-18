import { resolve } from 'node:path';
import { restoreBackup } from '../src/infrastructure/backup.js';
const backup=process.argv[2],target=process.argv[3];if(!backup||!target)throw new Error('Usage: npm run restore -- <backup-directory> <new-empty-data-directory>');
await restoreBackup(resolve(backup),resolve(target),process.env.RESTORE_DATABASE_URL);
console.log(JSON.stringify({operation:'restore',status:'complete',target:resolve(target)}));
