import type {
  WorkspaceBootstrapRequest,
  WorkspaceBootstrapResult,
  WorkspaceBootstrapper,
  RepositoryContext,
} from "@shadowbox/execution-engine/runtime";
import { ExecutionService } from "../../services/ExecutionService";
import type { Env } from "../../types/ai";

type GitAction =
  | "git_status"
  | "git_clone"
  | "git_fetch"
  | "git_branch_switch"
  | "git_branch_create"
  | "git_pull";

interface GitPluginResult {
  success: boolean;
  error?: string;
}

interface GitExecutionClient {
  execute(
    plugin: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<unknown>;
}

interface NormalizedRepositoryContext {
  owner: string;
  repo: string;
  branch: string;
  baseUrl?: string;
}

const SAFE_REPOSITORY_SEGMENT_REGEX = /^[A-Za-z0-9._-]{1,100}$/;
const SAFE_BRANCH_REGEX = /^[A-Za-z0-9._/-]{1,200}$/;
const AUTH_FAILURE_PATTERNS = [
  /authentication failed/i,
  /could not read username/i,
  /access denied/i,
  /permission denied/i,
  /denied to/i,
  /repository not found/i,
  /http.*\b(401|403)\b/i,
];
const NOT_GIT_REPOSITORY_PATTERNS = [/not a git repository/i];
const BRANCH_MISSING_PATTERNS = [
  /pathspec .* did not match any file/i,
  /unknown revision or path/i,
];
const REMOTE_REF_MISSING_PATTERNS = [/couldn't find remote ref/i];
const REMOTE_MISSING_PATTERNS = [/no such remote/i];
const NO_TRACKING_PATTERNS = [/there is no tracking information/i];

export class WorkspaceBootstrapService implements WorkspaceBootstrapper {
  constructor(private executionClient: GitExecutionClient) {}

  static fromEnv(
    env: Env,
    sessionId: string,
    runId: string,
    userId?: string,
  ): WorkspaceBootstrapService {
    const executionService = new ExecutionService(env, sessionId, runId, userId);
    return new WorkspaceBootstrapService(executionService);
  }

  async bootstrap(
    request: WorkspaceBootstrapRequest,
  ): Promise<WorkspaceBootstrapResult> {
    const normalized = normalizeRepositoryContext(request.repositoryContext);
    if (!normalized) {
      return {
        status: "invalid-context",
        message:
          "Repository context is missing or invalid. Select a repository and branch, then retry.",
      };
    }

    const cloneUrl = resolveCloneUrl(normalized);
    if (!cloneUrl) {
      return {
        status: "invalid-context",
        message:
          "Repository URL is invalid. Re-select the repository and branch, then retry.",
      };
    }

    const statusResult = await this.executeGit("git_status", {});
    if (!statusResult.success) {
      const statusError = statusResult.error ?? "Unable to check git status.";
      if (!matchesAny(statusError, NOT_GIT_REPOSITORY_PATTERNS)) {
        return mapGitFailure(statusError);
      }

      const cloneResult = await this.executeGit("git_clone", { url: cloneUrl });
      if (!cloneResult.success) {
        return mapGitFailure(
          cloneResult.error ?? "Failed to clone repository into workspace.",
        );
      }
    }

    return await this.syncBranch(normalized.branch);
  }

  private async syncBranch(branch: string): Promise<WorkspaceBootstrapResult> {
    const fetchResult = await this.executeGit("git_fetch", { remote: "origin" });
    if (!fetchResult.success) {
      const fetchError = fetchResult.error ?? "Failed to fetch from origin.";
      if (!matchesAny(fetchError, REMOTE_MISSING_PATTERNS)) {
        return mapGitFailure(fetchError);
      }
    }

    const switchResult = await this.executeGit("git_branch_switch", { branch });
    if (!switchResult.success) {
      const switchError = switchResult.error ?? "Failed to switch branch.";
      if (!matchesAny(switchError, BRANCH_MISSING_PATTERNS)) {
        return mapGitFailure(switchError);
      }

      const createResult = await this.executeGit("git_branch_create", { branch });
      if (!createResult.success) {
        return mapGitFailure(
          createResult.error ?? `Failed to create branch ${branch}.`,
        );
      }
    }

    const pullResult = await this.executeGit("git_pull", {
      remote: "origin",
      branch,
    });
    if (!pullResult.success) {
      const pullError = pullResult.error ?? "Failed to pull latest branch changes.";
      if (
        matchesAny(pullError, REMOTE_REF_MISSING_PATTERNS) ||
        matchesAny(pullError, REMOTE_MISSING_PATTERNS) ||
        matchesAny(pullError, NO_TRACKING_PATTERNS)
      ) {
        return { status: "ready" };
      }
      return mapGitFailure(pullError);
    }

    return { status: "ready" };
  }

  private async executeGit(
    action: GitAction,
    payload: Record<string, unknown>,
  ): Promise<GitPluginResult> {
    const result = await this.executionClient.execute("git", action, payload);
    return toGitPluginResult(result);
  }
}

function toGitPluginResult(result: unknown): GitPluginResult {
  if (!result || typeof result !== "object") {
    return {
      success: false,
      error: "Unexpected git plugin response.",
    };
  }

  const candidate = result as {
    success?: unknown;
    error?: unknown;
  };
  if (typeof candidate.success !== "boolean") {
    return {
      success: false,
      error: "Invalid git plugin response shape.",
    };
  }

  return {
    success: candidate.success,
    error: typeof candidate.error === "string" ? candidate.error : undefined,
  };
}

function mapGitFailure(error: string): WorkspaceBootstrapResult {
  if (matchesAny(error, AUTH_FAILURE_PATTERNS)) {
    return {
      status: "needs-auth",
      message:
        "GitHub authorization is required to access this repository. Reconnect GitHub and retry.",
    };
  }

  return {
    status: "sync-failed",
    message: sanitizeError(error),
  };
}

function normalizeRepositoryContext(
  repositoryContext: RepositoryContext,
): NormalizedRepositoryContext | null {
  const owner = repositoryContext.owner?.trim() ?? "";
  const repo = repositoryContext.repo?.trim() ?? "";
  const branch = repositoryContext.branch?.trim() || "main";
  const baseUrl = repositoryContext.baseUrl?.trim();

  if (
    !SAFE_REPOSITORY_SEGMENT_REGEX.test(owner) ||
    !SAFE_REPOSITORY_SEGMENT_REGEX.test(repo) ||
    !SAFE_BRANCH_REGEX.test(branch)
  ) {
    return null;
  }

  return {
    owner,
    repo,
    branch,
    baseUrl: baseUrl || undefined,
  };
}

function resolveCloneUrl(context: NormalizedRepositoryContext): string | null {
  if (!context.baseUrl) {
    return `https://github.com/${context.owner}/${context.repo}.git`;
  }

  try {
    const parsed = new URL(context.baseUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return null;
    }

    const cleanedPath = parsed.pathname
      .replace(/\/+$/g, "")
      .replace(/\.git$/i, "");

    if (!cleanedPath || cleanedPath === "/") {
      return null;
    }

    return `${parsed.origin}${cleanedPath}.git`;
  } catch {
    return null;
  }
}

function sanitizeError(error: string): string {
  const trimmed = error.trim();
  return trimmed.length > 0
    ? trimmed
    : "Workspace synchronization failed due to an unknown git error.";
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}
