import { resolve } from 'node:path';
import { loadConfig, nasRoot } from './config.js';
import { createArchiveService } from './application/archive-service.js';
import { buildApi } from './presentation/api.js';
import { setTimeout as delay } from 'node:timers/promises';

const config = loadConfig();
const service = await createArchiveService({ databaseUrl: config.DATABASE_URL, pglitePath: config.pglitePath, dataDir: config.dataDir, exportDir: config.exportDir, publicSnapshotPath: config.publicSnapshotPath, github: config.github, objectStorage: config.objectStorage, cdnPurge: config.cdnPurge, collectionMaxItems: config.COLLECTION_MAX_ITEMS_PER_SOURCE, autoPublish: config.AUTO_PUBLISH_ENABLED === 'true', publicationIntervalSeconds: Math.ceil(config.PUBLICATION_INTERVAL_MS / 1000) });
await service.initialize();
const app = buildApi(service, config, { adminDir: resolve(nasRoot, 'admin/dist') });
let stopping = false;
let worker: Promise<void> | undefined;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await worker;
  await service.close();
}
process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
await app.listen({ host: config.HOST, port: config.ADMIN_PORT });
if (!config.DATABASE_URL && config.LOCAL_WORKER_ENABLED === 'true') {
  worker = (async () => {
    let lastSchedule = 0;
    while (!stopping) {
      try {
        if (Date.now() - lastSchedule >= config.COLLECTION_INTERVAL_MS) {
          await service.scheduleDueSources();
          await service.verifyPendingPublications();
          lastSchedule = Date.now();
        }
        const job = await service.runNextJob();
        if (job) app.log.info({ operation: job.kind, jobId: job.id, status: job.state }, 'local_worker_completed');
        else await delay(Math.min(config.SCHEDULER_RETRY_MS, 1000));
      } catch { app.log.error({ errorCode: 'LOCAL_WORKER_FAILED' }, 'local_worker_failed'); await delay(Math.min(config.SCHEDULER_RETRY_MS, 1000)); }
    }
  })();
}
