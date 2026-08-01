import { collectSourceCycle, collectionStatePath, loadCollectionState } from "./collection.js";
import { remainingDelay } from "./scheduler-utils.js";
import { writeJson } from "./stages/common.js";

const intervalMs = Number(process.env.COLLECTION_INTERVAL_MS ?? 10 * 60 * 1000);
if (!Number.isFinite(intervalMs) || intervalMs < 60_000) throw new Error("COLLECTION_INTERVAL_MS must be at least 60000.");
const retryMs = Number(process.env.SCHEDULER_RETRY_MS ?? 60_000);
if (!Number.isFinite(retryMs) || retryMs < 5_000) throw new Error("SCHEDULER_RETRY_MS must be at least 5000.");

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

async function recordCollectionFailure(error: unknown): Promise<void> {
  const state = await loadCollectionState();
  state.lastAttemptedAt = new Date().toISOString();
  state.lastError = errorMessage(error);
  await writeJson(collectionStatePath(), state);
}

console.log(`[collector] maximum registered source sweep every ${intervalMs}ms`);
while (true) {
  const state = await loadCollectionState();
  const remaining = remainingDelay(state.lastCollectedAt, intervalMs);
  if (remaining > 0) await sleep(remaining);

  let nextDelayMs = intervalMs;
  try {
    const result = await collectSourceCycle();
    console.log(result.collected
      ? `[collector] swept ${result.topicIds.length} topics, ${result.attemptedSources} sources, ${result.addedDocuments} new documents, ${result.failedSources} failed sources`
      : "[collector] no configured topics");
  } catch (error) {
    console.error("[collector] collection failed", error);
    try {
      await recordCollectionFailure(error);
    } catch (stateError) {
      console.error("[collector] failed to persist collection error", stateError);
    }
    nextDelayMs = retryMs;
  }
  await sleep(nextDelayMs);
}
