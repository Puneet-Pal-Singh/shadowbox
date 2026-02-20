const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN =
  /(token|password|secret|authorization|cookie|api[_-]?key)/i;
const BEARER_TOKEN_PATTERN = /\b(Bearer)\s+[A-Za-z0-9\-._~+/]+=*/gi;
const BASIC_AUTH_PATTERN = /\b(Basic)\s+[A-Za-z0-9+/=]{8,}/gi;
const GITHUB_TOKEN_PATTERN =
  /\b(gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]+)\b/g;
const PROVIDER_KEY_PATTERN =
  /\b(sk-[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|xai-[A-Za-z0-9_-]{16,})\b/g;

export function sanitizeLogText(value: string): string {
  return value
    .replace(BEARER_TOKEN_PATTERN, `$1 ${REDACTED}`)
    .replace(BASIC_AUTH_PATTERN, `$1 ${REDACTED}`)
    .replace(GITHUB_TOKEN_PATTERN, REDACTED)
    .replace(PROVIDER_KEY_PATTERN, REDACTED);
}

export function sanitizeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeLogText(error.message);
  }
  return sanitizeLogText(String(error));
}

export function sanitizePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    sanitized[key] = sanitizeEntry(key, value);
  }
  return sanitized;
}

function sanitizeEntry(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED;
  }
  return sanitizeValue(value);
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeLogText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      result[nestedKey] = sanitizeEntry(nestedKey, nestedValue);
    }
    return result;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
