import { describe, expect, it } from "vitest";
import {
  enforceGoldenFlowToolFloor,
  getGoldenFlowToolNames,
  getGoldenFlowToolRegistry,
  getGoldenFlowToolRoute,
  isMutatingGoldenFlowToolName,
  validateGoldenFlowToolInput,
} from "./CodingToolGateway.js";

describe("CodingToolGateway", () => {
  it("exposes the canonical golden-flow tool floor", () => {
    const names = getGoldenFlowToolNames();
    expect(names).toEqual([
      "read_file",
      "list_files",
      "write_file",
      "bash",
      "git_stage",
      "git_commit",
      "git_push",
      "git_pull",
      "git_create_pull_request",
      "git_branch_create",
      "git_branch_switch",
      "git_status",
      "git_diff",
      "github_pr_list",
      "github_pr_get",
      "github_pr_checks_get",
      "github_review_threads_get",
      "github_issue_get",
      "github_actions_run_get",
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
    expect(getGoldenFlowToolRoute("bash")).toEqual({
      toolName: "bash",
      plugin: "bash",
      action: "run",
    });
    expect(getGoldenFlowToolRoute("git_diff")).toEqual({
      toolName: "git_diff",
      plugin: "git",
      action: "git_diff",
    });
    expect(getGoldenFlowToolRoute("git_commit")).toEqual({
      toolName: "git_commit",
      plugin: "git",
      action: "git_commit",
    });
    expect(getGoldenFlowToolRoute("github_pr_get")).toEqual({
      toolName: "github_pr_get",
      plugin: "github",
      action: "pr_get",
    });
    expect(getGoldenFlowToolRoute("github_pr_list")).toEqual({
      toolName: "github_pr_list",
      plugin: "github",
      action: "pr_list",
    });
    expect(getGoldenFlowToolRoute("github_actions_run_get")).toEqual({
      toolName: "github_actions_run_get",
      plugin: "github",
      action: "actions_run_get",
    });
    expect(getGoldenFlowToolRoute("git_pull")).toEqual({
      toolName: "git_pull",
      plugin: "git",
      action: "git_pull",
    });
    expect(getGoldenFlowToolRoute("git_create_pull_request")).toEqual({
      toolName: "git_create_pull_request",
      plugin: "git",
      action: "git_create_pull_request",
    });
    expect(getGoldenFlowToolRoute("unknown_tool")).toBeNull();
  });

  it("classifies mutating golden-flow tools conservatively", () => {
    expect(isMutatingGoldenFlowToolName("write_file")).toBe(true);
    expect(isMutatingGoldenFlowToolName("bash")).toBe(true);
    expect(isMutatingGoldenFlowToolName("git_commit")).toBe(true);
    expect(isMutatingGoldenFlowToolName("git_pull")).toBe(true);
    expect(isMutatingGoldenFlowToolName("git_create_pull_request")).toBe(true);
    expect(isMutatingGoldenFlowToolName("github_pr_get")).toBe(false);
    expect(isMutatingGoldenFlowToolName("read_file")).toBe(false);
    expect(isMutatingGoldenFlowToolName("git_diff")).toBe(false);
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

  it("validates tool inputs against canonical schemas", () => {
    const parsedGrep = validateGoldenFlowToolInput("grep", {
      pattern: "TODO",
      path: ".",
      maxResults: 5,
      caseSensitive: false,
      ignored: "field",
    });
    expect(parsedGrep).toEqual({
      pattern: "TODO",
      path: ".",
      maxResults: 5,
      caseSensitive: false,
    });

    expect(() =>
      validateGoldenFlowToolInput("grep", {
        pattern: "TODO",
        caseSensitive: "false",
      }),
    ).toThrow("Invalid grep input");
  });

  it("normalizes nullish input for tools that allow empty argument objects", () => {
    expect(validateGoldenFlowToolInput("git_status", null)).toEqual({});
    expect(validateGoldenFlowToolInput("git_stage", undefined)).toEqual({});
    expect(validateGoldenFlowToolInput("list_files", null)).toEqual({});
    expect(validateGoldenFlowToolInput("git_diff", undefined)).toEqual({});

    const registry = getGoldenFlowToolRegistry();
    expect(registry.git_status?.parameters.safeParse(null).success).toBe(true);
    expect(registry.git_stage?.parameters.safeParse(undefined).success).toBe(true);
    expect(registry.list_files?.parameters.safeParse(null).success).toBe(true);
    expect(registry.git_diff?.parameters.safeParse(null).success).toBe(true);
  });

  it("requires single-line git commit messages", () => {
    expect(() =>
      validateGoldenFlowToolInput("git_commit", {
        message: "feat: subject\n\nbody line",
      }),
    ).toThrow("Commit message must be a single-line subject");
  });
});
