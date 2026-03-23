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
      expect(result.messages[2]).toMatchObject({
        role: "user",
      });
      expect(executor.execute).toHaveBeenCalledTimes(1);
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
