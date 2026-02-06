import { Sandbox } from "@cloudflare/sandbox";
import type { IPlugin, PluginResult, LogCallback } from "../interfaces/types";
import type {
  GitStatusResponse,
  FileStatus,
  DiffContent,
  DiffHunk,
} from "../../../../packages/shared-types/src/git";

/**
 * Git payload interface with optional token for authentication
 * Following GEMINI.md: Clear interfaces for all tool inputs
 */
interface GitPayload {
  action: GitAction;
  runId: string;
  url?: string;
  token?: string;
  message?: string;
  branch?: string;
  path?: string;
  files?: string[];
  remote?: string;
  staged?: boolean;
}

type GitAction =
  | "status"
  | "diff"
  | "stage"
  | "unstage"
  | "commit"
  | "push"
  | "git_clone"
  | "git_diff"
  | "git_commit"
  | "git_push"
  | "git_pull"
  | "git_fetch"
  | "git_branch_create"
  | "git_branch_switch"
  | "git_branch_list"
  | "git_stage"
  | "git_status"
  | "git_config";

/**
 * GitPlugin - Handles all Git operations in the sandbox
 *
 * Security Notes:
 * - Tokens are passed securely from Brain and never logged
 * - All operations happen in isolated sandbox environment
 * - runId isolation maintained per GEMINI.md
 */
export class GitPlugin implements IPlugin {
  name = "git";

  // Tool definitions for AI agent integration
  tools = [
    {
      name: "git_status",
      description:
        "Get the current git status including modified, added, and deleted files",
      parameters: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "git_diff",
      description: "View changes made to files",
      parameters: {
        type: "object" as const,
        properties: {
          path: { type: "string" },
          staged: { type: "boolean" },
        },
        required: [],
      },
    },
    {
      name: "git_stage",
      description: "Stage files for commit",
      parameters: {
        type: "object" as const,
        properties: {
          files: { type: "array", items: { type: "string" } },
        },
        required: ["files"],
      },
    },
    {
      name: "git_commit",
      description: "Commit staged changes",
      parameters: {
        type: "object" as const,
        properties: {
          message: { type: "string" },
        },
        required: ["message"],
      },
    },
  ];

  async execute(
    sandbox: Sandbox,
    payload: GitPayload,
    onLog?: LogCallback,
  ): Promise<PluginResult> {
    const { action, runId, token } = payload;
    const worktree = `/home/sandbox/runs/${runId}`;

    try {
      // Configure git authentication if token provided
      if (token) {
        await this.configureGitAuth(sandbox, token);
      }

      switch (action) {
        case "status":
        case "git_status":
          return await this.getStatus(sandbox, worktree);
        case "diff":
        case "git_diff":
          return await this.getDiff(
            sandbox,
            worktree,
            payload.path,
            payload.staged,
          );
        case "stage":
        case "git_stage":
          return await this.stageFiles(sandbox, worktree, payload.files);
        case "unstage":
          return await this.unstageFiles(sandbox, worktree, payload.files);
        case "commit":
        case "git_commit":
          return await this.commit(
            sandbox,
            worktree,
            payload.message,
            payload.files,
          );
        case "push":
        case "git_push":
          return await this.push(sandbox, worktree, payload.remote, payload.branch);
        case "git_clone":
          return await this.clone(sandbox, payload.url, token, onLog);
        case "git_pull":
          return await this.pull(sandbox, worktree, payload.remote, payload.branch);
        case "git_fetch":
          return await this.fetch(sandbox, worktree, payload.remote);
        case "git_branch_create":
          return await this.createBranch(sandbox, worktree, payload.branch);
        case "git_branch_switch":
          return await this.switchBranch(sandbox, worktree, payload.branch);
        case "git_branch_list":
          return await this.listBranches(sandbox, worktree);
        case "git_config":
          return await this.configureGitAuth(sandbox, token || "");
        default:
          return { success: false, error: `Unsupported git action: ${action}` };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Git operation failed";
      return { success: false, error: msg };
    }
  }

  /**
   * Configure git authentication with token
   * Uses credential.helper for secure HTTPS authentication
   * Token is never logged or exposed
   */
  private async configureGitAuth(
    sandbox: Sandbox,
    token: string,
  ): Promise<PluginResult> {
    if (!token) {
      return { success: false, error: "Token is required for authentication" };
    }

    // Configure git to use token for HTTPS authentication
    const res = await sandbox.exec(
      `git config --global credential.helper '!f() { echo "username=x-access-token"; echo "password=${token}"; }; f'`,
    );

    if (res.exitCode !== 0) {
      return {
        success: false,
        error: "Failed to configure git authentication",
      };
    }

    return { success: true, output: "Git authentication configured" };
  }

  /**
   * Clone a repository
   * Supports both public and private repositories with token auth
   */
  private async clone(
    sandbox: Sandbox,
    url?: string,
    token?: string,
    onLog?: LogCallback,
  ): Promise<PluginResult> {
    if (!url) throw new Error("Clone URL is required");
    if (onLog) onLog(`Cloning repository: ${url}...\n`);

    // If token provided, inject it into the URL for authentication
    const cloneUrl = token
      ? url.replace("https://", `https://x-access-token:${token}@`)
      : url;

    const res = await sandbox.exec(`git clone ${cloneUrl} /root/repo`);
    if (res.exitCode !== 0) return { success: false, error: res.stderr };

    return {
      success: true,
      output: "Repository cloned successfully to /root/repo",
    };
  }

  private async getStatus(
    sandbox: Sandbox,
    worktree: string,
  ): Promise<PluginResult> {
    // Get porcelain status for parsing
    const statusRes = await sandbox.exec(
      `git -C ${worktree} status --porcelain -b`,
    );

    if (statusRes.exitCode !== 0) {
      return { success: false, error: statusRes.stderr };
    }

    // Parse branch info from first line
    const lines = statusRes.stdout.split("\n").filter((l) => l.trim());
    const branchLine = lines[0];
    let branch = "main";
    let ahead = 0;
    let behind = 0;

    if (branchLine && branchLine.startsWith("##")) {
      const match = branchLine.match(/##\s*(.+?)(?:\.\.\.|$)/);
      if (match && match[1]) branch = match[1];

      const aheadMatch = branchLine.match(/ahead\s+(\d+)/);
      const behindMatch = branchLine.match(/behind\s+(\d+)/);
      if (aheadMatch && aheadMatch[1]) ahead = parseInt(aheadMatch[1]);
      if (behindMatch && behindMatch[1]) behind = parseInt(behindMatch[1]);
    }

    // Parse file statuses
    const files: FileStatus[] = [];
    const fileLines = lines.slice(1);

    for (const line of fileLines) {
      if (line.length < 3) continue;

      const stagedStatus = line[0];
      const unstagedStatus = line[1];
      const filePath = line.substring(3).trim();

      // Determine overall status
      let status: FileStatus["status"] = "modified";
      let isStaged = stagedStatus !== " " && stagedStatus !== "?";

      if (stagedStatus === "A" || unstagedStatus === "A") status = "added";
      else if (stagedStatus === "D" || unstagedStatus === "D")
        status = "deleted";
      else if (stagedStatus === "R" || unstagedStatus === "R")
        status = "renamed";
      else if (stagedStatus === "?" || unstagedStatus === "?") {
        status = "untracked";
        isStaged = false;
      }

      files.push({
        path: filePath,
        status,
        additions: 0,
        deletions: 0,
        isStaged,
      });
    }

    const result: GitStatusResponse = {
      files,
      ahead,
      behind,
      branch,
      hasStaged: files.some((f) => f.isStaged),
      hasUnstaged: files.some((f) => !f.isStaged),
    };

    return { success: true, output: JSON.stringify(result) };
  }

  private async getDiff(
    sandbox: Sandbox,
    worktree: string,
    path?: string,
    staged?: boolean,
  ): Promise<PluginResult> {
    const cmd = staged
      ? `git -C ${worktree} diff --staged ${path || ""}`
      : `git -C ${worktree} diff ${path || ""}`;

    const res = await sandbox.exec(cmd);

    if (res.exitCode !== 0) {
      return { success: false, error: res.stderr };
    }

    // Parse diff output
    const diffContent = this.parseDiff(res.stdout, path);

    return {
      success: true,
      output: JSON.stringify(diffContent),
    };
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
      // Parse file headers
      if (line.startsWith("--- ")) {
        oldPath = line.substring(4).replace(/^a\//, "");
        if (line.includes("/dev/null")) isNewFile = true;
      } else if (line.startsWith("+++ ")) {
        newPath = line.substring(4).replace(/^b\//, "");
        if (line.includes("/dev/null")) isDeleted = true;
      }
      // Parse hunk header
      else if (line.startsWith("@@")) {
        if (currentHunk) hunks.push(currentHunk);

        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (match && match[1] && match[3]) {
          currentHunk = {
            oldStart: parseInt(match[1]),
            oldLines: parseInt(match[2] || "1"),
            newStart: parseInt(match[3]),
            newLines: parseInt(match[4] || "1"),
            lines: [],
            header: line,
          };
        }
      }
      // Parse diff lines
      else if (
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

    if (currentHunk) hunks.push(currentHunk);

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
    files?: string[],
  ): Promise<PluginResult> {
    const fileList = files && files.length > 0 ? files.map(f => `"${f}"`).join(" ") : ".";
    const res = await sandbox.exec(`git -C ${worktree} add ${fileList}`);

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? "Files staged" : res.stderr,
    };
  }

  private async unstageFiles(
    sandbox: Sandbox,
    worktree: string,
    files?: string[],
  ): Promise<PluginResult> {
    const fileList = files && files.length > 0 ? files.map(f => `"${f}"`).join(" ") : ".";
    const res = await sandbox.exec(`git -C ${worktree} reset HEAD ${fileList}`);

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? "Files unstaged" : res.stderr,
    };
  }

  private async commit(
    sandbox: Sandbox,
    worktree: string,
    message?: string,
    files?: string[],
  ): Promise<PluginResult> {
    if (!message) {
      return { success: false, error: "Commit message is required" };
    }

    // Stage specific files if provided
    if (files && files.length > 0) {
      const stageRes = await this.stageFiles(sandbox, worktree, files);
      if (!stageRes.success) return stageRes;
    }

    const res = await sandbox.exec(`git -C ${worktree} commit -m "${message}"`);

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? "Changes committed" : res.stderr,
    };
  }

  private async push(
    sandbox: Sandbox,
    worktree: string,
    remote?: string,
    branch?: string,
  ): Promise<PluginResult> {
    const targetRemote = remote || "origin";
    const targetBranch = branch || "";
    const res = await sandbox.exec(`git -C ${worktree} push ${targetRemote} ${targetBranch}`.trim());

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? "Changes pushed" : res.stderr,
    };
  }

  private async pull(
    sandbox: Sandbox,
    worktree: string,
    remote?: string,
    branch?: string,
  ): Promise<PluginResult> {
    const targetRemote = remote || "origin";
    const targetBranch = branch || "";

    const res = await sandbox.exec(
      `git -C ${worktree} pull ${targetRemote} ${targetBranch}`.trim(),
    );

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? "Changes pulled successfully" : res.stderr,
    };
  }

  private async fetch(
    sandbox: Sandbox,
    worktree: string,
    remote?: string,
  ): Promise<PluginResult> {
    const targetRemote = remote || "origin";

    const res = await sandbox.exec(`git -C ${worktree} fetch ${targetRemote}`);

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? "Fetched successfully" : res.stderr,
    };
  }

  private async createBranch(
    sandbox: Sandbox,
    worktree: string,
    branch?: string,
  ): Promise<PluginResult> {
    if (!branch) throw new Error("Branch name is required");

    const res = await sandbox.exec(`git -C ${worktree} checkout -b ${branch}`);

    return {
      success: res.exitCode === 0,
      output:
        res.exitCode === 0
          ? `Created and switched to branch: ${branch}`
          : res.stderr,
    };
  }

  private async switchBranch(
    sandbox: Sandbox,
    worktree: string,
    branch?: string,
  ): Promise<PluginResult> {
    if (!branch) throw new Error("Branch name is required");

    const res = await sandbox.exec(`git -C ${worktree} checkout ${branch}`);

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? `Switched to branch: ${branch}` : res.stderr,
    };
  }

  private async listBranches(sandbox: Sandbox, worktree: string): Promise<PluginResult> {
    const res = await sandbox.exec(`git -C ${worktree} branch -a`);

    return {
      success: res.exitCode === 0,
      output: res.stdout || "No branches found",
    };
  }
}