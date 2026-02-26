const PRIMARY_TEXT_KEYS = [
  "content",
  "stdout",
  "message",
  "text",
  "result",
] as const;

export function formatExecutionResult(result: unknown): string {
  if (typeof result === "string") {
    return redactInternalRuntimeDetails(result);
  }
  if (typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }
  if (!result) {
    return "";
  }
  if (isRecord(result)) {
    const directText = findPrimaryText(result);
    if (directText) {
      return redactInternalRuntimeDetails(directText);
    }
    if ("data" in result) {
      const nestedText = formatExecutionResult(result.data);
      if (nestedText) {
        return nestedText;
      }
    }
  }
  return redactInternalRuntimeDetails(safeStringify(result));
}

export function formatTaskOutput(outputContent: unknown): string {
  const formatted = formatExecutionResult(outputContent);
  return formatted || "no output";
}

function findPrimaryText(record: Record<string, unknown>): string | null {
  for (const key of PRIMARY_TEXT_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (isRecord(value) && typeof value.content === "string") {
      const nested = value.content.trim();
      if (nested.length > 0) {
        return nested;
      }
    }
  }
  return null;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function redactInternalRuntimeDetails(text: string): string {
  return text
    .replace(
      /\/home\/sandbox\/runs\/(?:\[run\]|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[^\s"']+/gi,
      "[workspace-file]",
    )
    .replace(
      /\/home\/sandbox\/runs\/(?:\[run\]|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
      "[workspace]",
    )
    .replace(
      /(?:error:\s*)?cat:\s*\[workspace-file\]\s*:?\s*no such file or directory/gi,
      "The requested file was not found in the current workspace.",
    )
    .replace(/http:\/\/internal(?:\/[^\s"']*)?/gi, "[internal-url]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
