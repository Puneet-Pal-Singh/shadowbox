const DEFAULT_WINDOW_MS = 60_000;
const PRUNE_WINDOW_MULTIPLIER = 10;

const lastLogTimestampByKey = new Map<string, number>();

export function logWarnRateLimited(
  key: string,
  message: string,
  details?: unknown,
  windowMs: number = DEFAULT_WINDOW_MS,
): void {
  if (!shouldLog(key, windowMs)) {
    return;
  }
  if (details === undefined) {
    console.warn(message);
    return;
  }
  console.warn(message, details);
}

export function logErrorRateLimited(
  key: string,
  message: string,
  details?: unknown,
  windowMs: number = DEFAULT_WINDOW_MS,
): void {
  if (!shouldLog(key, windowMs)) {
    return;
  }
  if (details === undefined) {
    console.error(message);
    return;
  }
  console.error(message, details);
}

function shouldLog(key: string, windowMs: number): boolean {
  pruneRateLimitedEntries(windowMs);
  const now = Date.now();
  const lastTimestamp = lastLogTimestampByKey.get(key);
  if (typeof lastTimestamp === "number" && now - lastTimestamp < windowMs) {
    return false;
  }
  lastLogTimestampByKey.set(key, now);
  return true;
}

function pruneRateLimitedEntries(windowMs: number): void {
  const maxAgeMs = windowMs * PRUNE_WINDOW_MULTIPLIER;
  const now = Date.now();
  for (const [key, timestamp] of lastLogTimestampByKey.entries()) {
    if (now - timestamp > maxAgeMs) {
      lastLogTimestampByKey.delete(key);
    }
  }
}
