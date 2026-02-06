// apps/secure-agent-api/src/plugins/FileSystemPlugin.ts
import { Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult } from "../interfaces/types";
import { FileSystemTools } from "../schemas/filesystem";

export class FileSystemPlugin implements IPlugin {
  name = "filesystem";
  tools = FileSystemTools;

  async execute(sandbox: Sandbox, payload: any): Promise<PluginResult> {
    // The payload will come in as { tool: "list_files", ...args } 
    // OR we need to handle the routing in AgentRuntime better.
    // For now, let's assume the AgentRuntime passes the specific tool name or we infer it.
    
    // Actually, looking at AgentRuntime, it passes 'payload'. 
    // We need to know WHICH tool was called. 
    // Let's assume the payload includes an 'action' field or we check the structure.
    // Standard pattern: { action: "list_files", path: "..." }
    
    const action = payload.action; 
    const runId = payload.runId || "default";
    const workspaceRoot = `/home/sandbox/workspaces/${runId}`;

    try {
      // Ensure workspace exists before any operation
      await sandbox.exec(`mkdir -p ${workspaceRoot}`);

      if (action === "list_files") {
        const path = payload.path || ".";
        const targetDir = `${workspaceRoot}/${path}`.replace(/\/+$/, '');
        
        // Safety check: prevent directory escape
        if (!targetDir.startsWith(workspaceRoot)) {
          return { success: false, error: "Access Denied: Path escapes workspace" };
        }

        const res = await sandbox.exec(`ls -F ${targetDir}`); // -F adds / to folders
        
        if (res.exitCode !== 0) {
          return { success: false, error: res.stderr || "Directory not found" };
        }

        const files = res.stdout.trim().split("\n").filter(f => f.length > 0);
        const total = files.length;
        
        if (total > 20) {
          const limited = files.slice(0, 20).join("\n");
          const output = `${limited}\n\n... and ${total - 20} more files (Total: ${total})`;
          return { success: true, output };
        }

        return { success: true, output: res.stdout };
      }

      if (action === "read_file") {
        const targetPath = `${workspaceRoot}/${payload.path}`;
        if (!targetPath.startsWith(workspaceRoot)) {
          return { success: false, error: "Access Denied: Path escapes workspace" };
        }

        const res = await sandbox.exec(`cat ${targetPath}`);
        if (res.exitCode !== 0) throw new Error(`File not found: ${res.stderr}`);
        return { success: true, output: res.stdout };
      }

      if (action === "write_file") {
        const targetPath = `${workspaceRoot}/${payload.path}`;
        if (!targetPath.startsWith(workspaceRoot)) {
          return { success: false, error: "Access Denied: Path escapes workspace" };
        }

        // Ensure parent directory exists
        const parentDir = targetPath.split('/').slice(0, -1).join('/');
        await sandbox.exec(`mkdir -p ${parentDir}`);

        await sandbox.writeFile(targetPath, payload.content);
        return { success: true, output: `Wrote ${payload.content.length} bytes to ${payload.path}` };
      }

      if (action === "make_dir") {
        const targetPath = `${workspaceRoot}/${payload.path}`;
        if (!targetPath.startsWith(workspaceRoot)) {
          return { success: false, error: "Access Denied: Path escapes workspace" };
        }
        const res = await sandbox.exec(`mkdir -p ${targetPath}`);
        return { success: res.exitCode === 0, output: res.exitCode === 0 ? "Directory created" : res.stderr };
      }

      return { success: false, error: `Unknown filesystem action: ${action}` };

    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}