import path from "node:path";

const RUN_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

export function normalizeRunId(input: string | undefined): string {
  const runId = input?.trim() || "default";
  if (!RUN_ID_REGEX.test(runId)) {
    throw new Error("Invalid runId format");
  }
  return runId;
}

export function getWorkspaceRoot(runId: string): string {
  return `/home/sandbox/runs/${runId}`;
}

export function resolveWorkspacePath(
  workspaceRoot: string,
  inputPath: string,
): string {
  if (containsIllegalPathChars(inputPath)) {
    throw new Error("Invalid path: contains illegal characters");
  }
  if (path.posix.isAbsolute(inputPath)) {
    throw new Error("Invalid path: absolute paths are not allowed");
  }

  const normalizedPath = path.posix.normalize(inputPath);
  if (normalizedPath === ".." || normalizedPath.startsWith("../")) {
    throw new Error("Invalid path: traversal sequences (..) not allowed");
  }

  const resolved = path.posix.resolve(workspaceRoot, normalizedPath);
  if (!isWithinWorkspace(workspaceRoot, resolved)) {
    throw new Error("Access Denied: path escapes workspace root");
  }
  return resolved;
}

export function validateRepoRelativePath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (trimmed.length === 0) {
    throw new Error("Invalid file path: empty path");
  }
  if (trimmed === ".") {
    return trimmed;
  }
  if (containsIllegalPathChars(trimmed)) {
    throw new Error("Invalid file path: contains illegal characters");
  }
  if (path.posix.isAbsolute(trimmed)) {
    throw new Error("Invalid file path: absolute paths are not allowed");
  }

  const normalized = path.posix.normalize(trimmed);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("Invalid file path: traversal sequences (..) not allowed");
  }
  return normalized;
}

function isWithinWorkspace(workspaceRoot: string, resolvedPath: string): boolean {
  const normalizedRoot = workspaceRoot.endsWith("/")
    ? workspaceRoot
    : `${workspaceRoot}/`;
  return resolvedPath === workspaceRoot || resolvedPath.startsWith(normalizedRoot);
}

function containsIllegalPathChars(inputPath: string): boolean {
  return /[\0\r\n]/.test(inputPath);
}
