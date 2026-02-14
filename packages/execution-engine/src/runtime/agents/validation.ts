// apps/brain/src/core/agents/validation.ts
// Phase 3D: Input validation utilities for agent task execution

import type { TaskInput } from "../types.js";

const PATH_TRAVERSAL_PATTERN = /\.\.\//;
const ABSOLUTE_PATH_PATTERN = /^\//;

/**
 * Validates that a file path is safe for filesystem operations.
 * Rejects path traversal sequences and ensures scoped access.
 */
export function validateSafePath(path: string): void {
  if (!path || path.trim().length === 0) {
    throw new PathValidationError("Path cannot be empty");
  }

  if (PATH_TRAVERSAL_PATTERN.test(path)) {
    throw new PathValidationError(
      `Path traversal detected: "${path}". Paths must not contain "../"`,
    );
  }

  if (ABSOLUTE_PATH_PATTERN.test(path)) {
    throw new PathValidationError(
      `Absolute paths are not allowed: "${path}". Use relative paths scoped to cwd`,
    );
  }
}

/**
 * Extracts a structured field from TaskInput by key.
 * Returns the string value if present and is a string, otherwise undefined.
 */
export function extractStructuredField(
  input: TaskInput,
  key: string,
): string | undefined {
  const value = input[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

export class PathValidationError extends Error {
  constructor(message: string) {
    super(`[agents/validation] ${message}`);
    this.name = "PathValidationError";
  }
}
