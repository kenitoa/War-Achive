import { collectSourceCycle, loadCollectionState } from "./collection.js";
import { remainingDelay } from "./scheduler-utils.js";

const intervalMs = Number(process.env.COLLECTION_INTERVAL_MS ?? 30 * 60 * 1000);
if (!Number.isFinite(intervalMs) || intervalMs < 60_000) throw new Error("COLLECTION_INTERVAL_MS는 60000 이상이어야 합니다.");

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

console.log(`[collector] maximum registered source sweep every ${intervalMs}ms`);
while (true) {
  const state = await loadCollectionState();
  const remaining = remainingDelay(state.lastCollectedAt, intervalMs);
  if (remaining > 0) await sleep(remaining);

  try {
    const result = await collectSourceCycle();
    console.log(result.collected
      ? `[collector] swept ${result.topicIds.length} topics, ${result.attemptedSources} sources, ${result.addedDocuments} new documents`
      : "[collector] no configured topics");
  } catch (error) {
    console.error("[collector] collection failed", error);
  }
  await sleep(intervalMs);
}
