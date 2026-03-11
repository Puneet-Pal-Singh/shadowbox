import { describe, expect, it } from "vitest";
import {
  enforceGoldenFlowToolFloor,
  getGoldenFlowToolNames,
  getGoldenFlowToolRegistry,
  getGoldenFlowToolRoute,
} from "./CodingToolGateway.js";

describe("CodingToolGateway", () => {
  it("exposes the canonical golden-flow tool floor", () => {
    const names = getGoldenFlowToolNames();
    expect(names).toEqual([
      "read_file",
      "list_files",
      "write_file",
      "run_command",
      "git_status",
      "git_diff",
      "glob",
      "grep",
    ]);

    const registry = getGoldenFlowToolRegistry();
    expect(Object.keys(registry)).toEqual(names);
  });

  it("maps llm-facing tool names to deterministic gateway routes", () => {
    expect(getGoldenFlowToolRoute("read_file")).toEqual({
      toolName: "read_file",
      plugin: "filesystem",
      action: "read_file",
    });
    expect(getGoldenFlowToolRoute("run_command")).toEqual({
      toolName: "run_command",
      plugin: "node",
      action: "run",
    });
    expect(getGoldenFlowToolRoute("git_diff")).toEqual({
      toolName: "git_diff",
      plugin: "git",
      action: "git_diff",
    });
    expect(getGoldenFlowToolRoute("unknown_tool")).toBeNull();
  });

  it("enforces bounded scope by dropping non-floor tools", () => {
    const filtered = enforceGoldenFlowToolFloor({
      read_file: {
        description: "custom read",
        parameters: {},
      } as unknown as import("ai").CoreTool,
      web_search: {
        description: "unsupported",
        parameters: {},
      } as unknown as import("ai").CoreTool,
    });

    expect(filtered.read_file?.description).toBe("custom read");
    expect(Object.keys(filtered)).toEqual(getGoldenFlowToolNames());
    expect("web_search" in filtered).toBe(false);
  });
});
