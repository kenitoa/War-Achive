import { loadPublicationState, publishNextRecord } from "./publication.js";
import { remainingDelay } from "./scheduler-utils.js";

const intervalMs = Number(process.env.PUBLICATION_INTERVAL_MS ?? 40 * 60 * 1000);
if (!Number.isFinite(intervalMs) || intervalMs < 60_000) throw new Error("PUBLICATION_INTERVAL_MS는 60000 이상이어야 합니다.");
const processingDelayMs = Number(process.env.PROCESSING_DELAY_MS ?? 10 * 60 * 1000);
if (!Number.isFinite(processingDelayMs) || processingDelayMs < 0) throw new Error("PROCESSING_DELAY_MS는 0 이상이어야 합니다.");

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

console.log(`[publisher] one processed record every ${intervalMs}ms after ${processingDelayMs}ms processing window`);
while (true) {
  const state = await loadPublicationState();
  const remaining = state.pendingTopicId ? 0 : remainingDelay(state.lastPublishedAt, intervalMs);
  if (remaining > 0) await sleep(remaining);

  try {
    const result = await publishNextRecord();
    console.log(result.published
      ? `[publisher] dispatched ${result.topicId}`
      : result.processingWaitMs
        ? `[publisher] processing window active for ${result.topicId}, ${result.processingWaitMs}ms remaining`
        : "[publisher] no unpublished processed records");
  } catch (error) {
    console.error("[publisher] publication failed", error);
  }
  await sleep(intervalMs);
}
