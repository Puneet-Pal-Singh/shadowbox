import { describe, expect, it, vi } from "vitest";
import type { ExecutionService } from "../services/ExecutionService";
import { TOOL_PERMISSION_MAP, createToolRegistry } from "./tools";

interface ExecutableTool {
  execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

describe("tool registry hardening", () => {
  it("declares permission metadata for all registered tools", () => {
    expect(TOOL_PERMISSION_MAP.list_files.permission.plugin).toBe("filesystem");
    expect(TOOL_PERMISSION_MAP.read_file.permission.action).toBe("read_file");
    expect(TOOL_PERMISSION_MAP.run_command.permission.allowlistedCommands).toBeDefined();
  });

  it("rejects non-allowlisted commands before dispatch", async () => {
    const execute = vi.fn();
    const registry = createToolRegistry({ execute } as unknown as ExecutionService);
    const runCommandTool = registry.run_command as unknown as ExecutableTool;

    const result = await runCommandTool.execute({ command: "rm -rf /" });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("Command not allowed");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects traversal paths before dispatch", async () => {
    const execute = vi.fn();
    const registry = createToolRegistry({ execute } as unknown as ExecutionService);
    const readFileTool = registry.read_file as unknown as ExecutableTool;

    const result = await readFileTool.execute({ path: "../etc/passwd" });

    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/traversal|Path/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("dispatches allowed actions with mapped plugin/action", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ success: true, output: "file1\nfile2" });
    const registry = createToolRegistry({ execute } as unknown as ExecutionService);
    const listFilesTool = registry.list_files as unknown as ExecutableTool;

    const result = await listFilesTool.execute({ path: "src" });

    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledWith("filesystem", "list_files", {
      path: "src",
    });
  });
});
