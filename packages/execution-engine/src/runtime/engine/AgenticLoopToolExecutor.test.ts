import { describe, expect, it } from "vitest";
import type { RuntimeExecutionService } from "../types.js";
import {
  executeAgenticLoopTool,
  normalizeWorkspacePath,
} from "./AgenticLoopToolExecutor.js";

describe("AgenticLoopToolExecutor", () => {
  it("preserves leading @ for workspace-scoped paths", () => {
    expect(normalizeWorkspacePath(" '@types/foo.ts', ")).toBe("@types/foo.ts");
    expect(normalizeWorkspacePath('"@scope/pkg";')).toBe("@scope/pkg");
  });

  it("executes github_pr_list through the github bridge route", async () => {
    const calls: Array<{
      plugin: string;
      action: string;
      payload: Record<string, unknown>;
    }> = [];
    const executionService: RuntimeExecutionService = {
      execute: async (plugin, action, payload) => {
        calls.push({ plugin, action, payload });
        return { output: "ok" };
      },
    };

    const result = await executeAgenticLoopTool(executionService, {
      taskId: "task-1",
      toolName: "github_pr_list",
      toolInput: {
        description: "List PRs",
        owner: "Puneet-Pal-Singh",
        repo: "career-crew",
        state: "open",
        head: " feat/admin-panel-get-all-jobs-feature ",
      },
    });

    expect(result.status).toBe("DONE");
    expect(calls).toEqual([
      {
        plugin: "github",
        action: "pr_list",
        payload: {
          owner: "Puneet-Pal-Singh",
          repo: "career-crew",
          state: "open",
          head: "feat/admin-panel-get-all-jobs-feature",
        },
      },
    ]);
  });
});
