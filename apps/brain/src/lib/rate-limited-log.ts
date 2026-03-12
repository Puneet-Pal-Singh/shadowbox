const DEFAULT_WINDOW_MS = 60_000;
const PRUNE_WINDOW_MULTIPLIER = 10;

interface RateLimitedLogEntry {
  timestamp: number;
  windowMs: number;
}

const lastLogByKey = new Map<string, RateLimitedLogEntry>();

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
  pruneRateLimitedEntries();
  const now = Date.now();
  const entry = lastLogByKey.get(key);
  if (entry && now - entry.timestamp < windowMs) {
    return false;
  }
  lastLogByKey.set(key, {
    timestamp: now,
    windowMs,
  });
  return true;
}

function pruneRateLimitedEntries(): void {
  const now = Date.now();
  for (const [key, entry] of lastLogByKey.entries()) {
    const maxAgeMs = entry.windowMs * PRUNE_WINDOW_MULTIPLIER;
    if (now - entry.timestamp > maxAgeMs) {
      lastLogByKey.delete(key);
    }
  }
}
