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

  it("executes github_cli_actions_job_logs_get through the bounded github_cli route", async () => {
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
      taskId: "task-github-cli-1",
      toolName: "github_cli_actions_job_logs_get",
      toolInput: {
        owner: "acme",
        repo: "career-crew",
        actionsJobId: 987654,
        tailLines: 200,
      },
    });

    expect(result.status).toBe("DONE");
    expect(calls).toEqual([
      {
        plugin: "github_cli",
        action: "actions_job_logs_get",
        payload: {
          owner: "acme",
          repo: "career-crew",
          actionsJobId: 987654,
          tailLines: 200,
          ghCliLaneEnabled: true,
          ghCliCiEnabled: true,
          ghCliPrCommentEnabled: true,
        },
      },
    ]);
  });

  it("executes github_cli_pr_comment as a bounded GitHub mutation", async () => {
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
      taskId: "task-github-cli-comment-1",
      toolName: "github_cli_pr_comment",
      toolInput: {
        owner: "acme",
        repo: "career-crew",
        number: 228,
        body: "Looks good to me.",
      },
    });

    expect(result.status).toBe("DONE");
    expect(calls).toEqual([
      {
        plugin: "github_cli",
        action: "pr_comment",
        payload: {
          owner: "acme",
          repo: "career-crew",
          number: 228,
          body: "Looks good to me.",
          ghCliLaneEnabled: true,
          ghCliCiEnabled: true,
          ghCliPrCommentEnabled: true,
        },
      },
    ]);
  });

  it("fails github_cli_pr_comment when the runtime feature flag disables PR comments", async () => {
    let executeCallCount = 0;
    const executionService: RuntimeExecutionService = {
      execute: async () => {
        executeCallCount += 1;
        return { output: "ok" };
      },
    };

    const result = await executeAgenticLoopTool(executionService, {
      taskId: "task-github-cli-comment-2",
      toolName: "github_cli_pr_comment",
      toolInput: {
        owner: "acme",
        repo: "career-crew",
        number: 228,
        body: "Looks good to me.",
        __runtimeFeatureFlags: {
          ghCliLaneEnabled: true,
          ghCliCiEnabled: true,
          ghCliPrCommentEnabled: false,
        },
      },
    });

    expect(result.status).toBe("FAILED");
    expect(result.error?.message).toContain("GH_CLI_PR_COMMENT_ENABLED");
    expect(executeCallCount).toBe(0);
  });

  it("blocks bash git config user identity commands and avoids execution", async () => {
    let executeCallCount = 0;
    const executionService: RuntimeExecutionService = {
      execute: async () => {
        executeCallCount += 1;
        return { output: "ok" };
      },
    };

    const result = await executeAgenticLoopTool(executionService, {
      taskId: "task-2",
      toolName: "bash",
      toolInput: {
        description: "Set git identity in shell",
        command:
          'git config user.email "agent@shadowbox.ai" && git config user.name "Shadowbox Agent"',
      },
    });

    expect(result.status).toBe("FAILED");
    expect(result.error?.message).toContain(
      "Do not run git config user.name/user.email through bash",
    );
    expect(executeCallCount).toBe(0);
  });

  it("still routes ordinary bash commands through the bash gateway", async () => {
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
      taskId: "task-3",
      toolName: "bash",
      toolInput: {
        description: "Read git state",
        command: "git status --short",
      },
    });

    expect(result.status).toBe("DONE");
    expect(calls).toEqual([
      {
        plugin: "bash",
        action: "run",
        payload: {
          command: "git status --short",
          description: "Read git state",
        },
      },
    ]);
  });
});
