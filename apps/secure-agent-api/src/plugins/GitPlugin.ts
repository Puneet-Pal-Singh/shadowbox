import { Sandbox } from "@cloudflare/sandbox";
import { z } from "zod";
import type { IPlugin, PluginResult, LogCallback } from "../interfaces/types";
import { GitTools } from "../schemas/git";
import type {
  DiffContent,
  DiffHunk,
  FileStatus,
  GitStatusResponse,
} from "@repo/shared-types";
import {
  getWorkspaceRoot,
  normalizeRunId,
  validateRepoRelativePath,
} from "./security/PathGuard";
import { runSafeCommand } from "./security/SafeCommand";

const GIT_ACTIONS = [
  "status",
  "diff",
  "stage",
  "unstage",
  "commit",
  "push",
  "git_clone",
  "git_diff",
  "git_commit",
  "git_push",
  "git_pull",
  "git_fetch",
  "git_branch_create",
  "git_branch_switch",
  "git_branch_list",
  "git_stage",
  "git_status",
  "git_config",
] as const;

type GitAction = (typeof GIT_ACTIONS)[number];

const GitPayloadSchema = z.object({
  action: z.enum(GIT_ACTIONS),
  runId: z.string().optional(),
  url: z.string().optional(),
  token: z.string().optional(),
  message: z.string().optional(),
  branch: z.string().optional(),
  path: z.string().optional(),
  files: z.array(z.string()).optional(),
  remote: z.string().optional(),
  staged: z.boolean().optional(),
});

type GitPayload = z.infer<typeof GitPayloadSchema>;

const SAFE_GIT_REF_REGEX = /^[A-Za-z0-9._/-]{1,200}$/;

export class GitPlugin implements IPlugin {
  name = "git";
  tools = GitTools;

  async execute(
    sandbox: Sandbox,
    payload: unknown,
    onLog?: LogCallback,
  ): Promise<PluginResult> {
    try {
      const parsed = GitPayloadSchema.parse(payload);
      const runId = normalizeRunId(parsed.runId);
      const worktree = getWorkspaceRoot(runId);

      await this.ensureWorkspace(sandbox, worktree);

      switch (parsed.action) {
        case "status":
        case "git_status":
          return await this.getStatus(sandbox, worktree);
        case "diff":
        case "git_diff":
          return await this.getDiff(
            sandbox,
            worktree,
            parsed.path,
            parsed.staged,
          );
        case "stage":
        case "git_stage":
          return await this.stageFiles(sandbox, worktree, parsed.files);
        case "unstage":
          return await this.unstageFiles(sandbox, worktree, parsed.files);
        case "commit":
        case "git_commit":
          return await this.commit(
            sandbox,
            worktree,
            parsed.message,
            parsed.files,
          );
        case "push":
        case "git_push":
          return await this.push(
            sandbox,
            worktree,
            parsed.remote,
            parsed.branch,
            parsed.token,
          );
        case "git_clone":
          return await this.clone(
            sandbox,
            worktree,
            parsed.url,
            parsed.token,
            onLog,
          );
        case "git_pull":
          return await this.pull(
            sandbox,
            worktree,
            parsed.remote,
            parsed.branch,
            parsed.token,
          );
        case "git_fetch":
          return await this.fetch(sandbox, worktree, parsed.remote, parsed.token);
        case "git_branch_create":
          return await this.createBranch(sandbox, worktree, parsed.branch);
        case "git_branch_switch":
          return await this.switchBranch(sandbox, worktree, parsed.branch);
        case "git_branch_list":
          return await this.listBranches(sandbox, worktree);
        case "git_config":
          return this.validateTokenOnly(parsed.token);
        default:
          return { success: false, error: "Unsupported git action" };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Git operation failed";
      return { success: false, error: message };
    }
  }

  private async ensureWorkspace(sandbox: Sandbox, worktree: string): Promise<void> {
    await runSafeCommand(
      sandbox,
      { command: "mkdir", args: ["-p", worktree] },
      ["mkdir"],
    );
  }

  private validateTokenOnly(token: string | undefined): PluginResult {
    if (!token || token.trim().length === 0) {
      return { success: false, error: "Token is required for git_config" };
    }
    if (containsIllegalTokenChars(token)) {
      return { success: false, error: "Invalid token format" };
    }
    return { success: true, output: "Token validated for authenticated git actions" };
  }

  private async clone(
    sandbox: Sandbox,
    worktree: string,
    url: string | undefined,
    token: string | undefined,
    onLog?: LogCallback,
  ): Promise<PluginResult> {
    const safeUrl = validateCloneUrl(url);
    const authArgs = this.buildGitAuthArgs(token);

    if (onLog) {
      onLog(`[git/plugin] Cloning repository into ${worktree}\n`);
    }

    const result = await runSafeCommand(
      sandbox,
      { command: "git", args: [...authArgs, "clone", safeUrl, worktree] },
      ["git"],
    );
    return buildGitResult(result, "Repository cloned successfully");
  }

  private async getStatus(
    sandbox: Sandbox,
    worktree: string,
  ): Promise<PluginResult> {
    const statusResult = await runSafeCommand(
      sandbox,
      {
        command: "git",
        args: ["-C", worktree, "status", "--porcelain", "-b"],
      },
      ["git"],
    );

    if (statusResult.exitCode !== 0) {
      return { success: false, error: statusResult.stderr };
    }

    const parsed = this.parseStatus(statusResult.stdout);
    return { success: true, output: JSON.stringify(parsed) };
  }

  private parseStatus(stdout: string): GitStatusResponse {
    const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
    const branchLine = lines[0];
    let branch = "main";
    let ahead = 0;
    let behind = 0;

    if (branchLine && branchLine.startsWith("##")) {
      const match = branchLine.match(/##\s*(.+?)(?:\.\.\.|$)/);
      if (match && match[1]) {
        branch = match[1];
      }

      const aheadMatch = branchLine.match(/ahead\s+(\d+)/);
      const behindMatch = branchLine.match(/behind\s+(\d+)/);
      if (aheadMatch && aheadMatch[1]) {
        ahead = Number.parseInt(aheadMatch[1], 10);
      }
      if (behindMatch && behindMatch[1]) {
        behind = Number.parseInt(behindMatch[1], 10);
      }
    }

    const files: FileStatus[] = lines.slice(1).flatMap((line) =>
      parseStatusLine(line),
    );

    return {
      files,
      ahead,
      behind,
      branch,
      hasStaged: files.some((file) => file.isStaged),
      hasUnstaged: files.some((file) => !file.isStaged),
    };
  }

  private async getDiff(
    sandbox: Sandbox,
    worktree: string,
    filePath: string | undefined,
    staged: boolean | undefined,
  ): Promise<PluginResult> {
    const args = ["-C", worktree, "diff"];
    if (staged) {
      args.push("--staged");
    }
    if (filePath) {
      args.push(validateRepoRelativePath(filePath));
    }

    const diffResult = await runSafeCommand(
      sandbox,
      { command: "git", args },
      ["git"],
    );
    if (diffResult.exitCode !== 0) {
      return { success: false, error: diffResult.stderr };
    }

    const parsedDiff = this.parseDiff(diffResult.stdout, filePath);
    return { success: true, output: JSON.stringify(parsedDiff) };
  }

  private parseDiff(diffOutput: string, filePath?: string): DiffContent {
    const lines = diffOutput.split("\n");
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;

    let oldPath = filePath || "";
    let newPath = filePath || "";
    let isNewFile = false;
    let isDeleted = false;

    for (const line of lines) {
      if (line.startsWith("--- ")) {
        oldPath = line.substring(4).replace(/^a\//, "");
        if (line.includes("/dev/null")) {
          isNewFile = true;
        }
      } else if (line.startsWith("+++ ")) {
        newPath = line.substring(4).replace(/^b\//, "");
        if (line.includes("/dev/null")) {
          isDeleted = true;
        }
      } else if (line.startsWith("@@")) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }

        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (match && match[1] && match[3]) {
          currentHunk = {
            oldStart: Number.parseInt(match[1], 10),
            oldLines: Number.parseInt(match[2] || "1", 10),
            newStart: Number.parseInt(match[3], 10),
            newLines: Number.parseInt(match[4] || "1", 10),
            lines: [],
            header: line,
          };
        }
      } else if (
        currentHunk &&
        (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-"))
      ) {
        const type = line.startsWith("+")
          ? "added"
          : line.startsWith("-")
            ? "deleted"
            : "unchanged";
        currentHunk.lines.push({
          type,
          content: line.substring(1),
        });
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return {
      oldPath,
      newPath,
      hunks,
      isBinary: false,
      isNewFile,
      isDeleted,
    };
  }

  private async stageFiles(
    sandbox: Sandbox,
    worktree: string,
    files: string[] | undefined,
  ): Promise<PluginResult> {
    const safeFiles = normalizeFileList(files);
    const result = await runSafeCommand(
      sandbox,
      {
        command: "git",
        args: ["-C", worktree, "add", "--", ...safeFiles],
      },
      ["git"],
    );

    return buildGitResult(result, "Files staged");
  }

  private async unstageFiles(
    sandbox: Sandbox,
    worktree: string,
    files: string[] | undefined,
  ): Promise<PluginResult> {
    const safeFiles = normalizeFileList(files);
    const result = await runSafeCommand(
      sandbox,
      {
        command: "git",
        args: ["-C", worktree, "reset", "HEAD", "--", ...safeFiles],
      },
      ["git"],
    );

    return buildGitResult(result, "Files unstaged");
  }

  private async commit(
    sandbox: Sandbox,
    worktree: string,
    message: string | undefined,
    files: string[] | undefined,
  ): Promise<PluginResult> {
    if (!message || message.trim().length === 0) {
      return { success: false, error: "Commit message is required" };
    }
    if (/[\0\r\n]/.test(message)) {
      return { success: false, error: "Commit message contains invalid characters" };
    }

    if (files && files.length > 0) {
      const stageResult = await this.stageFiles(sandbox, worktree, files);
      if (!stageResult.success) {
        return stageResult;
      }
    }

    const result = await runSafeCommand(
      sandbox,
      {
        command: "git",
        args: ["-C", worktree, "commit", "-m", message],
      },
      ["git"],
    );

    return buildGitResult(result, "Changes committed");
  }

  private async push(
    sandbox: Sandbox,
    worktree: string,
    remote: string | undefined,
    branch: string | undefined,
    token: string | undefined,
  ): Promise<PluginResult> {
    const safeRemote = sanitizeRef(remote || "origin", "remote");
    const authArgs = this.buildGitAuthArgs(token);
    const args = [...authArgs, "-C", worktree, "push", safeRemote];

    if (branch && branch.trim().length > 0) {
      args.push(sanitizeRef(branch, "branch"));
    }

    const result = await runSafeCommand(
      sandbox,
      { command: "git", args },
      ["git"],
    );
    return buildGitResult(result, "Changes pushed");
  }

  private async pull(
    sandbox: Sandbox,
    worktree: string,
    remote: string | undefined,
    branch: string | undefined,
    token: string | undefined,
  ): Promise<PluginResult> {
    const safeRemote = sanitizeRef(remote || "origin", "remote");
    const authArgs = this.buildGitAuthArgs(token);
    const args = [...authArgs, "-C", worktree, "pull", safeRemote];

    if (branch && branch.trim().length > 0) {
      args.push(sanitizeRef(branch, "branch"));
    }

    const result = await runSafeCommand(
      sandbox,
      { command: "git", args },
      ["git"],
    );
    return buildGitResult(result, "Changes pulled successfully");
  }

  private async fetch(
    sandbox: Sandbox,
    worktree: string,
    remote: string | undefined,
    token: string | undefined,
  ): Promise<PluginResult> {
    const safeRemote = sanitizeRef(remote || "origin", "remote");
    const authArgs = this.buildGitAuthArgs(token);
    const result = await runSafeCommand(
      sandbox,
      {
        command: "git",
        args: [...authArgs, "-C", worktree, "fetch", safeRemote],
      },
      ["git"],
    );
    return buildGitResult(result, "Fetched successfully");
  }

  private async createBranch(
    sandbox: Sandbox,
    worktree: string,
    branch: string | undefined,
  ): Promise<PluginResult> {
    if (!branch) {
      return { success: false, error: "Branch name is required" };
    }
    const safeBranch = sanitizeRef(branch, "branch");
    const result = await runSafeCommand(
      sandbox,
      {
        command: "git",
        args: ["-C", worktree, "checkout", "-b", safeBranch],
      },
      ["git"],
    );

    return buildGitResult(result, `Created and switched to branch: ${safeBranch}`);
  }

  private async switchBranch(
    sandbox: Sandbox,
    worktree: string,
    branch: string | undefined,
  ): Promise<PluginResult> {
    if (!branch) {
      return { success: false, error: "Branch name is required" };
    }
    const safeBranch = sanitizeRef(branch, "branch");
    const result = await runSafeCommand(
      sandbox,
      {
        command: "git",
        args: ["-C", worktree, "checkout", safeBranch],
      },
      ["git"],
    );

    return buildGitResult(result, `Switched to branch: ${safeBranch}`);
  }

  private async listBranches(
    sandbox: Sandbox,
    worktree: string,
  ): Promise<PluginResult> {
    const result = await runSafeCommand(
      sandbox,
      {
        command: "git",
        args: ["-C", worktree, "branch", "-a"],
      },
      ["git"],
    );

    return {
      success: result.exitCode === 0,
      output: result.stdout || "No branches found",
      error: result.exitCode === 0 ? undefined : result.stderr,
    };
  }

  private buildGitAuthArgs(token: string | undefined): string[] {
    if (!token || token.trim().length === 0) {
      return [];
    }
    if (containsIllegalTokenChars(token)) {
      throw new Error("Invalid token format");
    }

    const authValue = Buffer.from(`x-access-token:${token}`, "utf8").toString(
      "base64",
    );
    return ["-c", `http.extraheader=AUTHORIZATION: basic ${authValue}`];
  }
}

function parseStatusLine(line: string): FileStatus[] {
  if (line.length < 3) {
    return [];
  }

  const stagedStatus = line[0];
  const unstagedStatus = line[1];
  const filePath = line.substring(3).trim();

  let status: FileStatus["status"] = "modified";
  let isStaged = stagedStatus !== " " && stagedStatus !== "?";

  if (stagedStatus === "A" || unstagedStatus === "A") {
    status = "added";
  } else if (stagedStatus === "D" || unstagedStatus === "D") {
    status = "deleted";
  } else if (stagedStatus === "R" || unstagedStatus === "R") {
    status = "renamed";
  } else if (stagedStatus === "?" || unstagedStatus === "?") {
    status = "untracked";
    isStaged = false;
  }

  return [
    {
      path: filePath,
      status,
      additions: 0,
      deletions: 0,
      isStaged,
    },
  ];
}

function normalizeFileList(files: string[] | undefined): string[] {
  if (!files || files.length === 0) {
    return ["."];
  }
  return files.map((file) => validateRepoRelativePath(file));
}

function sanitizeRef(value: string, label: "branch" | "remote"): string {
  const normalized = value.trim();
  if (!SAFE_GIT_REF_REGEX.test(normalized)) {
    throw new Error(`Invalid ${label} name`);
  }
  return normalized;
}

function validateCloneUrl(url: string | undefined): string {
  if (!url || url.trim().length === 0) {
    throw new Error("Clone URL is required");
  }

  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Only https clone URLs are supported");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Tokenized clone URLs are not allowed");
  }
  return parsed.toString();
}

function containsIllegalTokenChars(token: string): boolean {
  return /[\0\r\n]/.test(token);
}

function buildGitResult(
  result: { exitCode: number; stdout: string; stderr: string },
  successMessage: string,
): PluginResult {
  return {
    success: result.exitCode === 0,
    output: result.exitCode === 0 ? successMessage : undefined,
    error: result.exitCode === 0 ? undefined : result.stderr,
  };
}
