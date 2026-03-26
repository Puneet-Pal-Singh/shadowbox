import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BudgetExceededError,
  SessionBudgetExceededError,
} from "../cost/index.js";
import type { ILLMGateway } from "../llm/index.js";
import type { IBudgetManager } from "../cost/index.js";
import type { TaskExecutor } from "../orchestration/index.js";
import { AgenticLoop, type AgenticLoopConfig } from "./AgenticLoop.js";

describe("AgenticLoop - Bounded Agentic Tool Chaining", () => {
  let config: AgenticLoopConfig;
  let llmGateway: Partial<ILLMGateway>;
  let executor: Partial<TaskExecutor>;
  let budgetManager: Partial<IBudgetManager>;
  let loop: AgenticLoop;

  beforeEach(() => {
    config = {
      maxSteps: 5,
      runId: "run-123",
      sessionId: "session-123",
    };

    llmGateway = {
      generateText: vi.fn(),
    };

    executor = {
      execute: vi.fn(),
    };

    budgetManager = {
      isOverBudget: vi.fn().mockResolvedValue(false),
    };

    config.budget = budgetManager as IBudgetManager;
    loop = new AgenticLoop(
      config,
      llmGateway as ILLMGateway,
      executor as TaskExecutor,
    );
  });

  describe("Configuration", () => {
    it("should reject maxSteps < 1", () => {
      expect(() => {
        new AgenticLoop(
          { maxSteps: 0, runId: "run-1", sessionId: "session-1" },
          llmGateway as ILLMGateway,
          executor as TaskExecutor,
        );
      }).toThrow("maxSteps must be >= 1");
    });

    it("should accept valid configuration", () => {
      expect(loop).toBeDefined();
    });
  });

  describe("Stop Reasons", () => {
    it("should stop with llm_stop when LLM doesn't request tools", async () => {
      vi.mocked(llmGateway.generateText!).mockResolvedValue({
        text: "Done",
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      const result = await loop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );

      expect(result.stopReason).toBe("llm_stop");
      expect(result.stepsExecuted).toBe(1);
    });

    it("should stop with budget_exceeded when budget is over", async () => {
      vi.mocked(budgetManager.isOverBudget!).mockResolvedValue(true);

      const result = await loop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );

      expect(result.stopReason).toBe("budget_exceeded");
    });

    it("should stop with budget_exceeded when BudgetExceededError thrown", async () => {
      vi.mocked(budgetManager.isOverBudget!).mockRejectedValue(
        new BudgetExceededError("run-123", 1.5, 1.0),
      );

      const result = await loop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );

      expect(result.stopReason).toBe("budget_exceeded");
    });
  });

  describe("Message Handling", () => {
    it("should add LLM response to message history", async () => {
      vi.mocked(llmGateway.generateText!).mockResolvedValue({
        text: "Response text",
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      const initialMessages = [{ role: "user" as const, content: "test" }];
      const result = await loop.execute(
        initialMessages,
        {},
        { agentType: "coding" },
      );

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual(initialMessages[0]);
      expect(result.messages[1]).toEqual({
        role: "assistant",
        content: "Response text",
      });
    });

    it("executes tool calls and appends tool results for next LLM step", async () => {
      vi.mocked(llmGateway.generateText!)
        .mockResolvedValueOnce({
          text: "Calling tool",
          toolCalls: [
            {
              id: "tool-call-1",
              toolName: "read_file",
              args: { path: "README.md" },
            },
          ],
          usage: { promptTokens: 10, completionTokens: 5 },
        })
        .mockResolvedValueOnce({
          text: "Tool result processed",
          toolCalls: [],
          usage: { promptTokens: 12, completionTokens: 6 },
        });

      vi.mocked(executor.execute!).mockResolvedValue({
        taskId: "tool-call-1",
        status: "DONE",
        output: { content: "README content" },
        completedAt: new Date(),
      });

      const tools = {
        read_file: {
          description: "Read a file",
        },
      } as unknown as Record<string, import("ai").CoreTool>;

      const result = await loop.execute(
        [{ role: "user", content: "read readme" }],
        tools,
        { agentType: "coding" },
      );

      expect(result.stopReason).toBe("llm_stop");
      expect(result.stepsExecuted).toBe(2);
      expect(result.toolExecutionCount).toBe(1);
      expect(result.failedToolCount).toBe(0);
      expect(result.toolLifecycle.map((event) => event.status)).toEqual([
        "requested",
        "started",
        "completed",
      ]);
      expect(result.toolLifecycle[2]).toMatchObject({
        toolName: "read_file",
        mutating: false,
      });
      expect(result.messages).toHaveLength(4);
      expect(result.messages[1]).toEqual({
        role: "assistant",
        content: [
          { type: "text", text: "Calling tool" },
          {
            type: "tool-call",
            toolCallId: "tool-call-1",
            toolName: "read_file",
            args: { path: "README.md" },
          },
        ],
      });
      expect(result.messages[2]).toEqual({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "tool-call-1",
            toolName: "read_file",
            result: { content: "README content" },
            isError: false,
          },
        ],
      });
      expect(executor.execute).toHaveBeenCalledTimes(1);
    });

    it("injects workspace context into the task-phase system prompt", async () => {
      vi.mocked(llmGateway.generateText!).mockResolvedValue({
        text: "Done",
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      await loop.execute(
        [{ role: "user", content: "check my landing page" }],
        {},
        {
          agentType: "coding",
          workspaceContext: "Repository: acme/career-crew\nBranch: main",
        },
      );

      expect(llmGateway.generateText).toHaveBeenCalledTimes(1);
      const firstRequest = vi.mocked(llmGateway.generateText).mock
        .calls[0]?.[0] as {
        system?: string;
      };
      expect(firstRequest.system).toContain("Repository: acme/career-crew");
      expect(firstRequest.system).toContain("Branch: main");
    });

    it("passes execution timing to tool lifecycle hooks", async () => {
      vi.mocked(llmGateway.generateText!)
        .mockResolvedValueOnce({
          text: "Calling tool",
          toolCalls: [
            {
              id: "tool-call-1",
              toolName: "read_file",
              args: { path: "README.md" },
            },
          ],
          usage: { promptTokens: 10, completionTokens: 5 },
        })
        .mockResolvedValueOnce({
          text: "Done",
          toolCalls: [],
          usage: { promptTokens: 12, completionTokens: 6 },
        });

      vi.mocked(executor.execute!).mockResolvedValue({
        taskId: "tool-call-1",
        status: "DONE",
        output: { content: "README content" },
        completedAt: new Date(),
      });

      const onToolCompleted = vi.fn(async () => undefined);
      const tools = {
        read_file: {
          description: "Read a file",
        },
      } as unknown as Record<string, import("ai").CoreTool>;

      await loop.execute([{ role: "user", content: "read readme" }], tools, {
        agentType: "coding",
        onToolCompleted,
      });

      expect(onToolCompleted).toHaveBeenCalledTimes(1);
      expect(onToolCompleted.mock.calls[0]?.[2]).toEqual(expect.any(Number));
    });

    it("can execute tools directly without routing through the task executor", async () => {
      vi.mocked(llmGateway.generateText!)
        .mockResolvedValueOnce({
          text: "Checking git status.",
          toolCalls: [
            {
              id: "tool-call-1",
              toolName: "git_status",
              args: {},
            },
          ],
          usage: { promptTokens: 10, completionTokens: 5 },
        })
        .mockResolvedValueOnce({
          text: "Your branch is main and the working tree is clean.",
          toolCalls: [],
          usage: { promptTokens: 12, completionTokens: 6 },
        });

      vi.mocked(executor.execute!).mockRejectedValue(
        new Error("task executor should be bypassed"),
      );

      const executeTool = vi.fn(async () => ({
        taskId: "tool-call-1",
        status: "DONE" as const,
        output: {
          content:
            '{"files":[],"ahead":0,"behind":0,"branch":"main","hasStaged":false,"hasUnstaged":false}',
        },
        completedAt: new Date(),
      }));

      const result = await loop.execute(
        [{ role: "user", content: "check my git info" }],
        {
          git_status: {
            description: "Inspect git status",
          },
        } as unknown as Record<string, import("ai").CoreTool>,
        {
          agentType: "coding",
          executeTool,
        },
      );

      expect(result.stopReason).toBe("llm_stop");
      expect(executeTool).toHaveBeenCalledWith({
        id: "tool-call-1",
        toolName: "git_status",
        args: {},
      });
      expect(executor.execute).not.toHaveBeenCalled();
    });

    it("stops with tool_error when LLM requests an unregistered tool", async () => {
      vi.mocked(llmGateway.generateText!).mockResolvedValue({
        text: "calling unknown tool",
        toolCalls: [
          {
            id: "unknown-call",
            toolName: "delete_all",
            args: {},
          },
        ],
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      const result = await loop.execute(
        [{ role: "user", content: "do something risky" }],
        {},
        { agentType: "coding" },
      );

      expect(result.stopReason).toBe("tool_error");
      expect(result.toolExecutionCount).toBe(1);
      expect(result.failedToolCount).toBe(1);
      expect(result.toolLifecycle.map((event) => event.status)).toEqual([
        "requested",
        "failed",
      ]);
      expect(executor.execute).not.toHaveBeenCalled();
    });

    it("continues after a non-mutating tool failure so the model can recover", async () => {
      vi.mocked(llmGateway.generateText!)
        .mockResolvedValueOnce({
          text: "Trying to read middleware directly first.",
          toolCalls: [
            {
              id: "tool-call-1",
              toolName: "read_file",
              args: { path: "middleware.ts" },
            },
          ],
          usage: { promptTokens: 10, completionTokens: 5 },
        })
        .mockResolvedValueOnce({
          text: "I'll search more broadly instead.",
          toolCalls: [
            {
              id: "tool-call-2",
              toolName: "grep",
              args: { pattern: "middleware", path: "." },
            },
          ],
          usage: { promptTokens: 12, completionTokens: 6 },
        })
        .mockResolvedValueOnce({
          text: "I found the middleware entrypoint.",
          toolCalls: [],
          usage: { promptTokens: 14, completionTokens: 7 },
        });

      vi.mocked(executor.execute!)
        .mockResolvedValueOnce({
          taskId: "tool-call-1",
          status: "FAILED",
          error: {
            message:
              "The requested file was not found in the current workspace.",
          },
          completedAt: new Date(),
        })
        .mockResolvedValueOnce({
          taskId: "tool-call-2",
          status: "DONE",
          output: {
            content: "src/middleware.ts:1: export function middleware()",
          },
          completedAt: new Date(),
        });

      const tools = {
        read_file: {
          description: "Read a file",
        },
        grep: {
          description: "Search file contents",
        },
      } as unknown as Record<string, import("ai").CoreTool>;

      const result = await loop.execute(
        [{ role: "user", content: "check my middleware" }],
        tools,
        { agentType: "coding" },
      );

      expect(result.stopReason).toBe("llm_stop");
      expect(result.stepsExecuted).toBe(3);
      expect(result.toolExecutionCount).toBe(2);
      expect(result.failedToolCount).toBe(1);
      expect(llmGateway.generateText).toHaveBeenCalledTimes(3);
      expect(result.toolLifecycle.map((event) => event.status)).toEqual([
        "requested",
        "started",
        "failed",
        "requested",
        "started",
        "completed",
      ]);
    });

    it("reserves the last step for synthesis instead of ending with a raw step-limit dump", async () => {
      const synthesisLoop = new AgenticLoop(
        {
          maxSteps: 2,
          runId: "run-123",
          sessionId: "session-123",
        },
        llmGateway as ILLMGateway,
        executor as TaskExecutor,
      );

      vi.mocked(llmGateway.generateText!)
        .mockResolvedValueOnce({
          text: "I'll inspect the repo first.",
          toolCalls: [
            {
              id: "tool-call-1",
              toolName: "git_status",
              args: {},
            },
          ],
          usage: { promptTokens: 8, completionTokens: 6 },
        })
        .mockResolvedValueOnce({
          text: "Your git branch is main and the working tree is clean.",
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 8 },
        });

      vi.mocked(executor.execute!).mockResolvedValue({
        taskId: "tool-call-1",
        status: "DONE",
        output: {
          content:
            '{"files":[],"ahead":0,"behind":0,"branch":"main","hasStaged":false,"hasUnstaged":false}',
        },
        completedAt: new Date(),
      });

      const tools = {
        git_status: {
          description: "Inspect git status",
        },
      } as unknown as Record<string, import("ai").CoreTool>;

      const result = await synthesisLoop.execute(
        [{ role: "user", content: "check my git info" }],
        tools,
        { agentType: "coding" },
      );

      expect(result.stopReason).toBe("llm_stop");
      expect(result.stepsExecuted).toBe(2);
      expect(llmGateway.generateText).toHaveBeenCalledTimes(2);
      const finalRequest = vi.mocked(llmGateway.generateText).mock
        .calls[1]?.[0] as {
        tools?: Record<string, unknown>;
        system?: string;
      };
      expect(finalRequest.tools).toBeUndefined();
      expect(finalRequest.system).toContain(
        "This is the final step. Do not call tools.",
      );
    });
  });

  describe("Statistics", () => {
    it("should track loop statistics", async () => {
      vi.mocked(llmGateway.generateText!).mockResolvedValue({
        text: "Done",
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      await loop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );

      const stats = loop.getStats();
      expect(stats.stepsExecuted).toBe(1);
      expect(stats.toolExecutionCount).toBe(0);
      expect(stats.failedToolCount).toBe(0);
      expect(stats.maxSteps).toBe(5);
    });

    it("should reset statistics", async () => {
      vi.mocked(llmGateway.generateText!).mockResolvedValue({
        text: "Done",
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      await loop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );
      let stats = loop.getStats();
      expect(stats.stepsExecuted).toBe(1);

      loop.reset();
      stats = loop.getStats();
      expect(stats.stepsExecuted).toBe(0);
    });
  });

  describe("Budget Enforcement", () => {
    it("should check budget before LLM call", async () => {
      vi.mocked(budgetManager.isOverBudget!).mockResolvedValue(false);
      vi.mocked(llmGateway.generateText!).mockResolvedValue({
        text: "Done",
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      await loop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );

      expect(budgetManager.isOverBudget).toHaveBeenCalledWith("run-123");
    });

    it("should propagate non-budget errors from budget check", async () => {
      vi.mocked(budgetManager.isOverBudget!).mockRejectedValue(
        new Error("Storage unavailable"),
      );

      await expect(
        loop.execute(
          [{ role: "user", content: "test" }],
          {},
          { agentType: "coding" },
        ),
      ).rejects.toThrow("Storage unavailable");
    });
  });
});
