import { Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult, LogCallback } from "../interfaces/types";
import { GitTool } from "../schemas/git";

export class GitPlugin implements IPlugin {
  name = "git";
  tools = [GitTool];

  async execute(sandbox: Sandbox, payload: any, onLog?: LogCallback): Promise<PluginResult> {
    // Payload: { url: "https://github.com/..." }
    const repoUrl = payload.url;
    
    if (!repoUrl) return { success: false, error: "Missing 'url'" };

    console.log(`[GitPlugin] Cloning ${repoUrl}...`);
    
    // We clone into /root/repo
    const cmd = `git clone ${repoUrl} /root/repo`;
    const res = await sandbox.exec(cmd);

    if (res.exitCode !== 0) {
      return { success: false, output: res.stdout, logs: [res.stderr], error: "Clone failed" };
    }

    // List files to show success
    const ls = await sandbox.exec("ls -F /root/repo");
    
    return {
      success: true,
      output: `Repo cloned successfully to /root/repo.\nFiles:\n${ls.stdout}`,
      logs: []
    };
  }
}