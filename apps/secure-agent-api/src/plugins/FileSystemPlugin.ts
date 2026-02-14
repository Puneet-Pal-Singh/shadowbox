// apps/secure-agent-api/src/plugins/FileSystemPlugin.ts
import { Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult, LogCallback } from "../interfaces/types";
import { FileSystemTools } from "../schemas/filesystem";
import { z } from "zod";
import path from "node:path";
import {
  getWorkspaceRoot,
  normalizeRunId,
  resolveWorkspacePath,
} from "./security/PathGuard";
import { runSafeCommand } from "./security/SafeCommand";

const FileSystemPayloadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list_files"),
    path: z.string().optional(),
    runId: z.string().optional(),
  }),
  z.object({
    action: z.literal("read_file"),
    path: z.string().min(1),
    runId: z.string().optional(),
  }),
  z.object({
    action: z.literal("write_file"),
    path: z.string().min(1),
    content: z.string(),
    runId: z.string().optional(),
  }),
  z.object({
    action: z.literal("make_dir"),
    path: z.string().min(1),
    runId: z.string().optional(),
  }),
]);

type FileSystemPayload = z.infer<typeof FileSystemPayloadSchema>;

export class FileSystemPlugin implements IPlugin {
  name = "filesystem";
  tools = FileSystemTools;

  async execute(
    sandbox: Sandbox,
    payload: unknown,
    _onLog?: LogCallback,
  ): Promise<PluginResult> {
    try {
      const parsedPayload = FileSystemPayloadSchema.parse(payload);
      const runId = normalizeRunId(parsedPayload.runId);
      const workspaceRoot = getWorkspaceRoot(runId);

      await runSafeCommand(
        sandbox,
        { command: "mkdir", args: ["-p", workspaceRoot] },
        ["mkdir"],
      );

      if (parsedPayload.action === "list_files") {
        return await this.listFiles(sandbox, workspaceRoot, parsedPayload);
      }
      if (parsedPayload.action === "read_file") {
        return await this.readFile(sandbox, workspaceRoot, parsedPayload);
      }
      if (parsedPayload.action === "write_file") {
        return await this.writeFile(sandbox, workspaceRoot, parsedPayload);
      }
      return await this.makeDirectory(sandbox, workspaceRoot, parsedPayload);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Filesystem operation failed";
      return { success: false, error: message };
    }
  }

  private async listFiles(
    sandbox: Sandbox,
    workspaceRoot: string,
    payload: Extract<FileSystemPayload, { action: "list_files" }>,
  ): Promise<PluginResult> {
    const targetDir = resolveWorkspacePath(workspaceRoot, payload.path ?? ".");
    const result = await runSafeCommand(
      sandbox,
      { command: "ls", args: ["-1p", targetDir] },
      ["ls"],
    );

    if (result.exitCode !== 0) {
      return { success: false, error: result.stderr || "Directory not found" };
    }

    const files = result.stdout
      .trim()
      .split("\n")
      .filter((entry) => entry.length > 0);
    const totalFiles = files.length;
    if (totalFiles > 20) {
      const limited = files.slice(0, 20).join("\n");
      return {
        success: true,
        output: `${limited}\n\n... and ${totalFiles - 20} more files (Total: ${totalFiles})`,
      };
    }

    return { success: true, output: result.stdout };
  }

  private async readFile(
    sandbox: Sandbox,
    workspaceRoot: string,
    payload: Extract<FileSystemPayload, { action: "read_file" }>,
  ): Promise<PluginResult> {
    const targetPath = resolveWorkspacePath(workspaceRoot, payload.path);
    const fileTypeResult = await runSafeCommand(
      sandbox,
      { command: "file", args: ["-b", "--mime-type", targetPath] },
      ["file"],
    );
    if (fileTypeResult.exitCode !== 0) {
      return { success: false, error: fileTypeResult.stderr || "Unable to read file type" };
    }

    const mimeType = fileTypeResult.stdout.trim().toLowerCase();
    if (isBinaryMimeType(mimeType)) {
      return { success: true, output: "[BINARY_FILE_DETECTED]", isBinary: true };
    }

    const result = await runSafeCommand(
      sandbox,
      { command: "cat", args: [targetPath] },
      ["cat"],
    );
    if (result.exitCode !== 0) {
      return { success: false, error: result.stderr || "File read failed" };
    }
    return { success: true, output: result.stdout };
  }

  private async writeFile(
    sandbox: Sandbox,
    workspaceRoot: string,
    payload: Extract<FileSystemPayload, { action: "write_file" }>,
  ): Promise<PluginResult> {
    const targetPath = resolveWorkspacePath(workspaceRoot, payload.path);
    const parentDir = path.posix.dirname(targetPath);

    await runSafeCommand(
      sandbox,
      { command: "mkdir", args: ["-p", parentDir] },
      ["mkdir"],
    );

    await sandbox.writeFile(targetPath, payload.content);
    return {
      success: true,
      output: `Wrote ${payload.content.length} bytes to ${payload.path}`,
    };
  }

  private async makeDirectory(
    sandbox: Sandbox,
    workspaceRoot: string,
    payload: Extract<FileSystemPayload, { action: "make_dir" }>,
  ): Promise<PluginResult> {
    const targetPath = resolveWorkspacePath(workspaceRoot, payload.path);
    const result = await runSafeCommand(
      sandbox,
      { command: "mkdir", args: ["-p", targetPath] },
      ["mkdir"],
    );
    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0 ? "Directory created" : result.stderr,
      error: result.exitCode === 0 ? undefined : result.stderr,
    };
  }
}

function isBinaryMimeType(mimeType: string): boolean {
  return (
    mimeType.includes("application/octet-stream") ||
    mimeType.includes("application/x-executable") ||
    mimeType.includes("application/x-sharedlib")
  );
}
