import { loadPublicationState, publicationStatePath, publishNextRecord } from "./publication.js";
import { remainingDelay } from "./scheduler-utils.js";
import { writeJson } from "./stages/common.js";

const intervalMs = Number(process.env.PUBLICATION_INTERVAL_MS ?? 60 * 60 * 1000);
if (!Number.isFinite(intervalMs) || intervalMs < 60_000) throw new Error("PUBLICATION_INTERVAL_MS must be at least 60000.");
const processingDelayMs = Number(process.env.PROCESSING_DELAY_MS ?? 10 * 60 * 1000);
if (!Number.isFinite(processingDelayMs) || processingDelayMs < 0) throw new Error("PROCESSING_DELAY_MS must be at least 0.");
const retryMs = Number(process.env.SCHEDULER_RETRY_MS ?? 60_000);
if (!Number.isFinite(retryMs) || retryMs < 5_000) throw new Error("SCHEDULER_RETRY_MS must be at least 5000.");

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

async function recordPublicationFailure(error: unknown): Promise<void> {
  const state = await loadPublicationState();
  state.lastAttemptedAt = new Date().toISOString();
  state.lastError = errorMessage(error);
  await writeJson(publicationStatePath(), state);
}

console.log(`[publisher] one processed record every ${intervalMs}ms after ${processingDelayMs}ms processing window`);
while (true) {
  const state = await loadPublicationState();
  const lastPublicationActivityAt = state.lastAttemptedAt ?? state.lastPublishedAt;
  const scheduleBaseAt = state.lastError ? state.lastAttemptedAt : lastPublicationActivityAt;
  const scheduleIntervalMs = state.lastError ? retryMs : intervalMs;
  const remaining = state.pendingTopicId
    ? 0
    : remainingDelay(scheduleBaseAt, scheduleIntervalMs);
  if (remaining > 0) {
    await sleep(remaining);
    continue;
  }

  try {
    const result = await publishNextRecord();
    console.log(result.published
      ? `[publisher] dispatched ${result.topicId}`
      : result.publicationDisabled
        ? "[publisher] GitHub publication disabled; no record was marked published"
      : result.processingWaitMs
        ? `[publisher] processing window active for ${result.topicId}, ${result.processingWaitMs}ms remaining`
        : "[publisher] no unpublished processed records");
    if (result.processingWaitMs) await sleep(Math.min(intervalMs, Math.max(5_000, result.processingWaitMs)));
  } catch (error) {
    console.error("[publisher] publication failed", error);
    try {
      await recordPublicationFailure(error);
    } catch (stateError) {
      console.error("[publisher] failed to persist publication error", stateError);
    }
  }
}
