const PRIMARY_TEXT_KEYS = [
  "content",
  "output",
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

export function extractExecutionFailure(result: unknown): string | null {
  if (!isRecord(result)) {
    return null;
  }

  if (result.success === false) {
    const explicitError = readStringField(result.error);
    if (explicitError) {
      return redactInternalRuntimeDetails(explicitError);
    }

    const message =
      readStringField(result.message) ?? readStringField(result.stderr);
    if (message) {
      return redactInternalRuntimeDetails(message);
    }

    return "Execution failed";
  }

  const stderr = readStringField(result.stderr);
  if (typeof result.exitCode === "number" && result.exitCode !== 0) {
    return redactInternalRuntimeDetails(
      stderr ?? `Command failed with exit code ${result.exitCode}`,
    );
  }

  return null;
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
      "the workspace file",
    )
    .replace(
      /\/home\/sandbox\/runs\/(?:\[run\]|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
      "the workspace directory",
    )
    .replace(
      /(?:error:\s*)?cat:\s*(?:the workspace file|\[workspace-file\])\s*:?\s*no such file or directory/gi,
      "The requested file was not found in the current workspace.",
    )
    .replace(
      /(?:error:\s*)?cat:\s*(?:the workspace file|\[workspace-file\])\s*:?\s*is a directory/gi,
      "The requested path is a directory. Please provide a file path.",
    )
    .replace(/http:\/\/internal(?:\/[^\s"']*)?/gi, "[internal-url]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringField(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (isRecord(value)) {
    const content =
      typeof value.content === "string"
        ? value.content
        : typeof value.output === "string"
          ? value.output
          : null;
    if (typeof content === "string" && content.trim().length > 0) {
      return content.trim();
    }
  }

  return null;
}
