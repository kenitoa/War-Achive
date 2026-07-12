import { loadPublicationState, publishNextRecord } from "./publication.js";
import { remainingDelay } from "./scheduler-utils.js";

const intervalMs = Number(process.env.PUBLICATION_INTERVAL_MS ?? 40 * 60 * 1000);
if (!Number.isFinite(intervalMs) || intervalMs < 60_000) throw new Error("PUBLICATION_INTERVAL_MS는 60000 이상이어야 합니다.");

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

console.log(`[publisher] one record every ${intervalMs}ms`);
while (true) {
  const state = await loadPublicationState();
  const remaining = state.pendingTopicId ? 0 : remainingDelay(state.lastPublishedAt, intervalMs);
  if (remaining > 0) await sleep(remaining);

  try {
    const result = await publishNextRecord();
    console.log(result.published ? `[publisher] dispatched ${result.topicId}` : "[publisher] no unpublished records");
  } catch (error) {
    console.error("[publisher] publication failed", error);
  }
  await sleep(intervalMs);
}
