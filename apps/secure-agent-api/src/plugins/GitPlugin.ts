import { Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult, LogCallback } from "../interfaces/types";
import { GitTools } from "../schemas/git";

interface GitPayload {
  action: "git_clone" | "git_diff" | "git_commit";
  url?: string;
  message?: string;
}

export class GitPlugin implements IPlugin {
  name = "git";
  tools = GitTools;

  async execute(sandbox: Sandbox, payload: GitPayload, onLog?: LogCallback): Promise<PluginResult> {
    const { action } = payload;

    try {
      switch (action) {
        case "git_clone":
          return await this.clone(sandbox, payload.url, onLog);
        case "git_diff":
          return await this.diff(sandbox);
        case "git_commit":
          return await this.commit(sandbox, payload.message);
        default:
          return { success: false, error: `Unsupported git action: ${action}` };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Git operation failed";
      return { success: false, error: msg };
    }
  }

  private async clone(sandbox: Sandbox, url?: string, onLog?: LogCallback): Promise<PluginResult> {
    if (!url) throw new Error("Clone URL is required");
    if (onLog) onLog(`Cloning repository: ${url}...\n`);
    
    const res = await sandbox.exec(`git clone ${url} /root/repo`);
    if (res.exitCode !== 0) return { success: false, error: res.stderr };
    
    return { success: true, output: "Repository cloned successfully to /root/repo" };
  }

  private async diff(sandbox: Sandbox): Promise<PluginResult> {
    const res = await sandbox.exec("git -C /root/repo diff");
    return { success: true, output: res.stdout || "No changes detected." };
  }

  private async commit(sandbox: Sandbox, message?: string): Promise<PluginResult> {
    if (!message) throw new Error("Commit message is required");
    
    await sandbox.exec("git -C /root/repo add .");
    const res = await sandbox.exec(`git -C /root/repo commit -m "${message}"`);
    
    return { 
      success: res.exitCode === 0, 
      output: res.exitCode === 0 ? "Changes committed" : res.stderr 
    };
  }
}