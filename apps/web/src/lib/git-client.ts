import type {
  CommitPayload,
  DiffContent,
  GitStatusResponse,
  StageFilesRequest,
} from "@repo/shared-types";
import { z } from "zod";
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

const gitRequestContextSchema = z.object({
  runId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
});

const gitDiffRequestContextSchema = gitRequestContextSchema.extend({
  path: z.string().min(1),
  staged: z.boolean().optional(),
});

const commitPayloadSchema = z.object({
  message: z.string().min(1),
  files: z.array(z.string().min(1)).optional(),
});

const gitCommitRequestContextSchema = gitRequestContextSchema.extend({
  payload: commitPayloadSchema,
});

const gitStageRequestContextSchema = gitRequestContextSchema.extend({
  files: z.array(z.string().min(1)),
  unstage: z.boolean().optional(),
});

const fileStatusSchema = z.object({
  path: z.string(),
  status: z.enum(["modified", "added", "deleted", "renamed", "untracked"]),
  additions: z.number(),
  deletions: z.number(),
  isStaged: z.boolean(),
});

const gitStatusReadySchema = z.object({
  files: z.array(fileStatusSchema),
  ahead: z.number(),
  behind: z.number(),
  branch: z.string(),
  hasStaged: z.boolean(),
  hasUnstaged: z.boolean(),
  gitAvailable: z.literal(true),
});

const gitSoftErrorSchema = z.object({
  success: z.literal(false),
  error: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
});

const gitNotRepositorySchema = z.object({
  gitAvailable: z.literal(false).optional(),
  recoverableCode: z.literal("NOT_A_GIT_REPOSITORY").optional(),
});

export async function getGitStatus(
  context: GitRequestContext,
): Promise<GitStatusResponse> {
  const parsedContext = gitRequestContextSchema.parse(context);
  const response = await fetch(
    gitStatusPath(parsedContext.runId, parsedContext.sessionId),
  );

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
  const parsedContext = gitDiffRequestContextSchema.parse(context);
  const response = await fetch(
    gitDiffPath({
      runId: parsedContext.runId,
      sessionId: parsedContext.sessionId,
      path: parsedContext.path,
      staged: parsedContext.staged,
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
  const parsedContext = gitStageRequestContextSchema.parse(context);
  const response = await fetch(gitStagePath(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId: parsedContext.runId,
      sessionId: parsedContext.sessionId,
      files: parsedContext.files,
      unstage: parsedContext.unstage ?? false,
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
  const parsedContext = gitCommitRequestContextSchema.parse(context);
  const response = await fetch(gitCommitPath(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...parsedContext.payload,
      runId: parsedContext.runId,
      sessionId: parsedContext.sessionId,
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
  } catch (error) {
    console.warn("[git-client] Failed to parse git error payload", error);
  }

  return fallbackMessage;
}

function normalizeGitStatusResponse(payload: unknown): GitStatusResponse {
  const softError = gitSoftErrorSchema.safeParse(payload);
  if (softError.success) {
    const errorMessage =
      softError.data.error ?? softError.data.message ?? softError.data.code;
    if (errorMessage?.includes("not a git repository")) {
      return getNotGitRepositoryStatus();
    }
    throw new Error(errorMessage ?? "Invalid git status response");
  }

  if (gitNotRepositorySchema.safeParse(payload).success) {
    return getNotGitRepositoryStatus();
  }

  const parsedStatus = gitStatusReadySchema.safeParse(payload);
  if (!parsedStatus.success) {
    throw new Error(
      `Invalid git status response: ${parsedStatus.error.issues[0]?.message ?? "missing fields"}`,
    );
  }

  return parsedStatus.data;
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
