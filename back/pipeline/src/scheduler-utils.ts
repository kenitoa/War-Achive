export function remainingDelay(lastSuccessAt: string | undefined, intervalMs: number, now = Date.now()): number {
  if (!lastSuccessAt) return 0;
  const last = Date.parse(lastSuccessAt);
  if (!Number.isFinite(last)) return 0;
  return Math.min(intervalMs, Math.max(0, intervalMs - (now - last)));
}
