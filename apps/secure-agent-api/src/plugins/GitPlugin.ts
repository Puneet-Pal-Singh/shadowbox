import { Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult, LogCallback } from "../interfaces/types";
import { GitTools } from "../schemas/git";

/**
 * Git payload interface with optional token for authentication
 * Following GEMINI.md: Clear interfaces for all tool inputs
 */
interface GitPayload {
  action: GitAction;
  url?: string;
  token?: string;
  message?: string;
  branch?: string;
  files?: string[];
  remote?: string;
}

type GitAction =
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
  tools = GitTools;

  async execute(
    sandbox: Sandbox,
    payload: GitPayload,
    onLog?: LogCallback,
  ): Promise<PluginResult> {
    const { action, token } = payload;

    try {
      // Configure git authentication if token provided
      if (token) {
        await this.configureGitAuth(sandbox, token);
      }

      switch (action) {
        case "git_clone":
          return await this.clone(sandbox, payload.url, token, onLog);
        case "git_diff":
          return await this.diff(sandbox);
        case "git_commit":
          return await this.commit(sandbox, payload.message);
        case "git_push":
          return await this.push(sandbox, payload.remote, payload.branch);
        case "git_pull":
          return await this.pull(sandbox, payload.remote, payload.branch);
        case "git_fetch":
          return await this.fetch(sandbox, payload.remote);
        case "git_branch_create":
          return await this.createBranch(sandbox, payload.branch);
        case "git_branch_switch":
          return await this.switchBranch(sandbox, payload.branch);
        case "git_branch_list":
          return await this.listBranches(sandbox);
        case "git_stage":
          return await this.stage(sandbox, payload.files);
        case "git_status":
          return await this.status(sandbox);
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
    // This is a one-time setup that applies to all git operations
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

  /**
   * Show diff of current changes
   */
  private async diff(sandbox: Sandbox): Promise<PluginResult> {
    const res = await sandbox.exec("git -C /root/repo diff");
    return { success: true, output: res.stdout || "No changes detected." };
  }

  /**
   * Stage specific files or all changes
   */
  private async stage(
    sandbox: Sandbox,
    files?: string[],
  ): Promise<PluginResult> {
    if (files && files.length > 0) {
      // Stage specific files
      for (const file of files) {
        const res = await sandbox.exec(`git -C /root/repo add "${file}"`);
        if (res.exitCode !== 0) {
          return {
            success: false,
            error: `Failed to stage ${file}: ${res.stderr}`,
          };
        }
      }
      return { success: true, output: `Staged ${files.length} file(s)` };
    } else {
      // Stage all changes
      const res = await sandbox.exec("git -C /root/repo add .");
      if (res.exitCode !== 0) {
        return { success: false, error: res.stderr };
      }
      return { success: true, output: "All changes staged" };
    }
  }

  /**
   * Commit staged changes
   */
  private async commit(
    sandbox: Sandbox,
    message?: string,
  ): Promise<PluginResult> {
    if (!message) throw new Error("Commit message is required");

    const res = await sandbox.exec(`git -C /root/repo commit -m "${message}"`);

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? "Changes committed" : res.stderr,
    };
  }

  /**
   * Push changes to remote
   */
  private async push(
    sandbox: Sandbox,
    remote?: string,
    branch?: string,
  ): Promise<PluginResult> {
    const targetRemote = remote || "origin";
    const targetBranch = branch || "HEAD";

    const res = await sandbox.exec(
      `git -C /root/repo push ${targetRemote} ${targetBranch}`,
    );

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? "Changes pushed successfully" : res.stderr,
    };
  }

  /**
   * Pull changes from remote
   */
  private async pull(
    sandbox: Sandbox,
    remote?: string,
    branch?: string,
  ): Promise<PluginResult> {
    const targetRemote = remote || "origin";
    const targetBranch = branch || "";

    const res = await sandbox.exec(
      `git -C /root/repo pull ${targetRemote} ${targetBranch}`.trim(),
    );

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? "Changes pulled successfully" : res.stderr,
    };
  }

  /**
   * Fetch from remote
   */
  private async fetch(
    sandbox: Sandbox,
    remote?: string,
  ): Promise<PluginResult> {
    const targetRemote = remote || "origin";

    const res = await sandbox.exec(`git -C /root/repo fetch ${targetRemote}`);

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? "Fetched successfully" : res.stderr,
    };
  }

  /**
   * Create a new branch
   */
  private async createBranch(
    sandbox: Sandbox,
    branch?: string,
  ): Promise<PluginResult> {
    if (!branch) throw new Error("Branch name is required");

    const res = await sandbox.exec(`git -C /root/repo checkout -b ${branch}`);

    return {
      success: res.exitCode === 0,
      output:
        res.exitCode === 0
          ? `Created and switched to branch: ${branch}`
          : res.stderr,
    };
  }

  /**
   * Switch to an existing branch
   */
  private async switchBranch(
    sandbox: Sandbox,
    branch?: string,
  ): Promise<PluginResult> {
    if (!branch) throw new Error("Branch name is required");

    const res = await sandbox.exec(`git -C /root/repo checkout ${branch}`);

    return {
      success: res.exitCode === 0,
      output: res.exitCode === 0 ? `Switched to branch: ${branch}` : res.stderr,
    };
  }

  /**
   * List all branches
   */
  private async listBranches(sandbox: Sandbox): Promise<PluginResult> {
    const res = await sandbox.exec("git -C /root/repo branch -a");

    return {
      success: res.exitCode === 0,
      output: res.stdout || "No branches found",
    };
  }

  /**
   * Show git status
   */
  private async status(sandbox: Sandbox): Promise<PluginResult> {
    const res = await sandbox.exec("git -C /root/repo status");

    return {
      success: res.exitCode === 0,
      output: res.stdout || "Status unavailable",
    };
  }
}
