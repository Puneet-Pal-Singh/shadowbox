import { Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult, LogCallback } from "../interfaces/types";
import { NodeTool } from "../schemas/node";

export class NodePlugin implements IPlugin {
  name = "node";
  tools = [NodeTool];

  async execute(sandbox: Sandbox, payload: any, onLog?: LogCallback): Promise<PluginResult> {
    const runId = payload.runId || "default";
    const workspaceRoot = `/home/sandbox/workspaces/${runId}`;
    
    // Ensure workspace exists
    await sandbox.exec(`mkdir -p ${workspaceRoot}`);

    // Action: run_command
    if (payload.action === "run") {
      if (onLog) onLog(`[System] Executing in workspace: ${payload.command}\n`);
      // Prefix with cd to workspace
      const result = await sandbox.exec(`cd ${workspaceRoot} && ${payload.command}`);
      
      if (onLog) {
        if (result.stdout) onLog(result.stdout);
        if (result.stderr) onLog(`\x1b[31m${result.stderr}\x1b[0m`);
      }

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.exitCode !== 0 ? result.stderr : undefined
      };
    }

    // Default legacy behavior for code-blocks
    const ext = payload.isTypeScript ? "ts" : "js";
    const fileName = `${workspaceRoot}/index.${ext}`;
    const runner = payload.isTypeScript ? "tsx" : "node";

    await sandbox.writeFile(fileName, payload.code);
    if (onLog) onLog(`[System] Running ${runner} index.${ext}...\n`);

    const result = await sandbox.exec(`cd ${workspaceRoot} && ${runner} index.${ext}`);

    if (onLog) {
        if (result.stdout) onLog(result.stdout);
        if (result.stderr) onLog(`\x1b[31m${result.stderr}\x1b[0m`);
    }

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined
    };
  }
}