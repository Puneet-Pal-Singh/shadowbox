interface NormalizeWorkspaceShellCommandInput {
  command: string;
  cwd?: string;
}

interface NormalizeWorkspaceShellCommandResult {
  command: string;
  cwd?: string;
}

const LEADING_CD_PATTERN =
  /^\s*cd\s+((?:"[^"]+"|'[^']+'|`[^`]+`|[^;&|])+?)\s*(?:&&|;)\s*([\s\S]+)$/i;
const SANDBOX_WORKSPACE_PREFIX = /^\/home\/sandbox\/runs\/[^/]+\/?/i;

export function normalizeWorkspaceShellCommand(
  input: NormalizeWorkspaceShellCommandInput,
): NormalizeWorkspaceShellCommandResult {
  const trimmedCommand = input.command.trim();
  const explicitCwd = normalizeOptionalCwd(input.cwd);
  if (explicitCwd) {
    return {
      command: trimmedCommand,
      cwd: explicitCwd,
    };
  }

  const parsed = parseLeadingDirectoryChange(trimmedCommand);
  if (!parsed) {
    return { command: trimmedCommand };
  }

  const embeddedPath = normalizeCwdToken(parsed.pathToken);
  if (!embeddedPath) {
    return { command: parsed.remainder };
  }

  if (embeddedPath === "." || embeddedPath === "./") {
    return { command: parsed.remainder };
  }

  if (embeddedPath.startsWith("/")) {
    const relativeWorkspacePath = convertSandboxWorkspacePath(embeddedPath);
    if (!relativeWorkspacePath) {
      return { command: parsed.remainder };
    }

    return {
      command: parsed.remainder,
      cwd: relativeWorkspacePath === "." ? undefined : relativeWorkspacePath,
    };
  }

  return {
    command: parsed.remainder,
    cwd: embeddedPath,
  };
}

export function resolveWorkspaceRelativeShellPath(
  cwd: string | undefined,
  path: string,
): string {
  const normalizedPath = normalizeCwdToken(path);
  if (!normalizedPath) {
    return ".";
  }

  if (!cwd || cwd === ".") {
    return normalizedPath || ".";
  }

  if (normalizedPath === "." || normalizedPath === "./") {
    return cwd;
  }

  const trimmedCwd = cwd.replace(/^\.\/+/, "").replace(/\/+$/, "");
  const trimmedPath = normalizedPath.replace(/^\.\/+/, "");
  return trimmedPath ? `${trimmedCwd}/${trimmedPath}` : trimmedCwd;
}

function normalizeOptionalCwd(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeCwdToken(value);
  return normalized || undefined;
}

function parseLeadingDirectoryChange(
  command: string,
): { pathToken: string; remainder: string } | null {
  const match = command.match(LEADING_CD_PATTERN);
  if (!match) {
    return null;
  }

  const pathToken = match[1]?.trim();
  const remainder = match[2]?.trim();
  if (!pathToken || !remainder) {
    return null;
  }

  return {
    pathToken,
    remainder,
  };
}

function normalizeCwdToken(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const quote = trimmed[0];
  if (
    (quote === "'" || quote === '"' || quote === "`") &&
    trimmed[trimmed.length - 1] === quote
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function convertSandboxWorkspacePath(path: string): string | null {
  const match = path.match(SANDBOX_WORKSPACE_PREFIX);
  if (!match) {
    return null;
  }

  const relativePath = path.replace(SANDBOX_WORKSPACE_PREFIX, "").replace(/^\/+/, "");
  return relativePath || ".";
}
