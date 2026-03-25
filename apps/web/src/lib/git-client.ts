import type {
  CommitPayload,
  DiffContent,
  GitStatusResponse,
  StageFilesRequest,
} from "@repo/shared-types";
import {
  gitCommitPath,
  gitDiffPath,
  gitStagePath,
  gitStatusPath,
} from "./platform-endpoints.js";

interface GitRequestContext {
  runId: string;
  sessionId?: string;
}

interface GitDiffRequestContext extends GitRequestContext {
  path: string;
  staged?: boolean;
}

interface GitCommitRequestContext extends GitRequestContext {
  payload: CommitPayload;
}

interface GitStageRequestContext extends GitRequestContext, StageFilesRequest {}

export async function getGitStatus(
  context: GitRequestContext,
): Promise<GitStatusResponse> {
  const response = await fetch(gitStatusPath(context.runId, context.sessionId));

  if (!response.ok) {
    throw new Error(
      await readGitErrorMessage(
        response,
        `Failed to fetch git status: HTTP ${response.status}`,
      ),
    );
  }

  const payload = (await response.json()) as unknown;
  return normalizeGitStatusResponse(payload);
}

export async function getGitDiff(
  context: GitDiffRequestContext,
): Promise<DiffContent> {
  const response = await fetch(
    gitDiffPath({
      runId: context.runId,
      sessionId: context.sessionId,
      path: context.path,
      staged: context.staged,
    }),
  );

  if (!response.ok) {
    throw new Error(
      await readGitErrorMessage(
        response,
        `Failed to fetch diff: HTTP ${response.status}`,
      ),
    );
  }

  return (await response.json()) as DiffContent;
}

export async function stageGitFiles(
  context: GitStageRequestContext,
): Promise<void> {
  const response = await fetch(gitStagePath(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId: context.runId,
      sessionId: context.sessionId,
      files: context.files,
      unstage: context.unstage ?? false,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readGitErrorMessage(
        response,
        `Failed to update staged files: HTTP ${response.status}`,
      ),
    );
  }
}

export async function commitGitChanges(
  context: GitCommitRequestContext,
): Promise<void> {
  const response = await fetch(gitCommitPath(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...context.payload,
      runId: context.runId,
      sessionId: context.sessionId,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readGitErrorMessage(
        response,
        `Failed to commit changes: HTTP ${response.status}`,
      ),
    );
  }
}

async function readGitErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
      code?: string;
    };

    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }

    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }

    if (typeof payload.code === "string" && payload.code.trim()) {
      return payload.code;
    }
  } catch {
    // No-op. Fall back to a generic message below.
  }

  return fallbackMessage;
}

function normalizeGitStatusResponse(payload: unknown): GitStatusResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid git status response: expected JSON object");
  }

  const apiErrorPayload = payload as { success?: boolean; error?: string };
  if (
    apiErrorPayload.success === false &&
    typeof apiErrorPayload.error === "string"
  ) {
    if (apiErrorPayload.error.includes("not a git repository")) {
      return getNotGitRepositoryStatus();
    }
    throw new Error(apiErrorPayload.error);
  }

  const candidate = payload as Partial<GitStatusResponse>;
  const files = Array.isArray(candidate.files) ? candidate.files : [];
  if (!Array.isArray(candidate.files) && looksLikeSoftGitStatusPayload(payload)) {
    throw new Error("Invalid git status response: soft payload missing files");
  }

  if (candidate.recoverableCode === "NOT_A_GIT_REPOSITORY") {
    return getNotGitRepositoryStatus();
  }

  if (candidate.gitAvailable === false) {
    return getNotGitRepositoryStatus();
  }

  return {
    files,
    ahead: typeof candidate.ahead === "number" ? candidate.ahead : 0,
    behind: typeof candidate.behind === "number" ? candidate.behind : 0,
    branch: typeof candidate.branch === "string" ? candidate.branch : "",
    hasStaged:
      typeof candidate.hasStaged === "boolean" ? candidate.hasStaged : false,
    hasUnstaged:
      typeof candidate.hasUnstaged === "boolean" ? candidate.hasUnstaged : false,
    gitAvailable: true,
  };
}

function looksLikeSoftGitStatusPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const objectPayload = payload as Record<string, unknown>;
  return (
    "success" in objectPayload ||
    "error" in objectPayload ||
    "message" in objectPayload
  );
}

function getNotGitRepositoryStatus(): GitStatusResponse {
  return {
    files: [],
    ahead: 0,
    behind: 0,
    branch: "",
    hasStaged: false,
    hasUnstaged: false,
    gitAvailable: false,
    recoverableCode: "NOT_A_GIT_REPOSITORY",
  };
}
