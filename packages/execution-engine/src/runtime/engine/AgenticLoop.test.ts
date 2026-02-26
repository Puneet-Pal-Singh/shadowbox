import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BudgetExceededError,
  SessionBudgetExceededError,
} from "../cost/index.js";
import type { ILLMGateway } from "../llm/index.js";
import type { IBudgetManager } from "../cost/index.js";
import type { TaskExecutor } from "./TaskExecutor.js";
import type { TaskResult } from "../types.js";
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
      generateWithTools: vi.fn(),
    };

    executor = {
      execute: vi.fn(),
    };

    budgetManager = {
      checkRunBudget: vi.fn(),
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
      vi.mocked(llmGateway.generateWithTools).mockResolvedValue({
        text: "Done",
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5 },
        stopReason: "end_turn",
      });

      const result = await loop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );

      expect(result.stopReason).toBe("llm_stop");
      expect(result.stepsExecuted).toBe(1);
    });

    it("should stop with max_steps_reached when limit is hit", async () => {
      vi.mocked(llmGateway.generateWithTools).mockResolvedValue({
        text: "Continue",
        toolCalls: [
          {
            id: "call-1",
            toolName: "readFile",
            args: { path: "/test" },
          },
        ],
        usage: { promptTokens: 10, completionTokens: 5 },
        stopReason: "tool_calls",
      });

      vi.mocked(executor.execute).mockResolvedValue({
        taskId: "call-1",
        status: "DONE",
        output: { content: "result" },
        completedAt: new Date(),
      });

      const smallConfig: AgenticLoopConfig = {
        maxSteps: 2,
        runId: "run-123",
        sessionId: "session-123",
      };
      const smallLoop = new AgenticLoop(
        smallConfig,
        llmGateway as ILLMGateway,
        executor as TaskExecutor,
      );

      const result = await smallLoop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );

      expect(result.stopReason).toBe("max_steps_reached");
      expect(result.stepsExecuted).toBe(2);
    });

    it("should stop with budget_exceeded when budget exceeded", async () => {
      vi.mocked(llmGateway.generateWithTools).mockResolvedValue({
        text: "Continue",
        toolCalls: [
          {
            id: "call-1",
            toolName: "readFile",
            args: { path: "/test" },
          },
        ],
        usage: { promptTokens: 10, completionTokens: 5 },
        stopReason: "tool_calls",
      });

      let callCount = 0;
      vi.mocked(budgetManager.checkRunBudget).mockImplementation(async () => {
        callCount++;
        if (callCount > 1) {
          throw new BudgetExceededError("Run budget exceeded");
        }
      });

      const result = await loop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );

      expect(result.stopReason).toBe("budget_exceeded");
    });
  });

  describe("Tool Execution", () => {
    it("should execute tools and collect results", async () => {
      vi.mocked(llmGateway.generateWithTools)
        .mockResolvedValueOnce({
          text: "Calling tool",
          toolCalls: [
            {
              id: "call-1",
              toolName: "readFile",
              args: { path: "/test.txt" },
            },
            {
              id: "call-2",
              toolName: "writeFile",
              args: { path: "/out.txt", content: "data" },
            },
          ],
          usage: { promptTokens: 10, completionTokens: 5 },
          stopReason: "tool_calls",
        })
        .mockResolvedValueOnce({
          text: "Done",
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 5 },
          stopReason: "end_turn",
        });

      vi.mocked(executor.execute).mockResolvedValue({
        taskId: "call-1",
        status: "DONE",
        output: { content: "file content" },
        completedAt: new Date(),
      });

      const result = await loop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );

      expect(result.toolExecutionCount).toBe(2);
      expect(result.failedToolCount).toBe(0);
      expect(result.stopReason).toBe("llm_stop");
    });

    it("should track failed tool executions", async () => {
      vi.mocked(llmGateway.generateWithTools)
        .mockResolvedValueOnce({
          text: "Calling tool",
          toolCalls: [
            {
              id: "call-1",
              toolName: "readFile",
              args: { path: "/test.txt" },
            },
          ],
          usage: { promptTokens: 10, completionTokens: 5 },
          stopReason: "tool_calls",
        })
        .mockResolvedValueOnce({
          text: "Done",
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 5 },
          stopReason: "end_turn",
        });

      // First call fails, second succeeds
      vi.mocked(executor.execute)
        .mockResolvedValueOnce({
          taskId: "call-1",
          status: "FAILED",
          error: { message: "File not found" },
          completedAt: new Date(),
        })
        .mockResolvedValueOnce({
          taskId: "call-2",
          status: "DONE",
          output: { content: "result" },
          completedAt: new Date(),
        });

      const result = await loop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );

      expect(result.toolExecutionCount).toBe(1);
      expect(result.failedToolCount).toBe(1);
    });

    it("should continue loop when tools succeed", async () => {
      let callCount = 0;
      vi.mocked(llmGateway.generateWithTools).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: "Calling tool",
            toolCalls: [
              {
                id: "call-1",
                toolName: "readFile",
                args: { path: "/test" },
              },
            ],
            usage: { promptTokens: 10, completionTokens: 5 },
            stopReason: "tool_calls",
          };
        }
        return {
          text: "Done",
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 5 },
          stopReason: "end_turn",
        };
      });

      vi.mocked(executor.execute).mockResolvedValue({
        taskId: "call-1",
        status: "DONE",
        output: { content: "result" },
        completedAt: new Date(),
      });

      const result = await loop.execute(
        [{ role: "user", content: "test" }],
        {},
        { agentType: "coding" },
      );

      // Should have made 2 LLM calls: one with tool request, one final
      expect(callCount).toBe(2);
      expect(result.stopReason).toBe("llm_stop");
      expect(result.stepsExecuted).toBe(2);
    });
  });

  describe("Message Handling", () => {
    it("should add LLM response to message history", async () => {
      vi.mocked(llmGateway.generateWithTools).mockResolvedValue({
        text: "Response text",
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5 },
        stopReason: "end_turn",
      });

      const initialMessages = [{ role: "user" as const, content: "test" }];
      const result = await loop.execute(initialMessages, {}, { agentType: "coding" });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual(initialMessages[0]);
      expect(result.messages[1]).toEqual({
        role: "assistant",
        content: "Response text",
      });
    });
  });

  describe("Statistics", () => {
    it("should track loop statistics", async () => {
      vi.mocked(llmGateway.generateWithTools).mockResolvedValue({
        text: "Done",
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5 },
        stopReason: "end_turn",
      });

      await loop.execute([{ role: "user", content: "test" }], {}, { agentType: "coding" });

      const stats = loop.getStats();
      expect(stats.stepsExecuted).toBe(1);
      expect(stats.toolExecutionCount).toBe(0);
      expect(stats.failedToolCount).toBe(0);
      expect(stats.maxSteps).toBe(5);
    });

    it("should reset statistics", async () => {
      vi.mocked(llmGateway.generateWithTools).mockResolvedValue({
        text: "Done",
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5 },
        stopReason: "end_turn",
      });

      await loop.execute([{ role: "user", content: "test" }], {}, { agentType: "coding" });
      let stats = loop.getStats();
      expect(stats.stepsExecuted).toBe(1);

      loop.reset();
      stats = loop.getStats();
      expect(stats.stepsExecuted).toBe(0);
    });
  });

  describe("Budget Enforcement", () => {
    it("should check budget before LLM call", async () => {
      vi.mocked(budgetManager.checkRunBudget).mockResolvedValue(undefined);
      vi.mocked(llmGateway.generateWithTools).mockResolvedValue({
        text: "Done",
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5 },
        stopReason: "end_turn",
      });

      await loop.execute([{ role: "user", content: "test" }], {}, { agentType: "coding" });

      expect(budgetManager.checkRunBudget).toHaveBeenCalledWith("run-123");
    });

    it("should check budget before tool execution", async () => {
      let budgetCheckCount = 0;
      vi.mocked(budgetManager.checkRunBudget).mockImplementation(async () => {
        budgetCheckCount++;
      });

      vi.mocked(llmGateway.generateWithTools)
        .mockResolvedValueOnce({
          text: "Calling tool",
          toolCalls: [
            {
              id: "call-1",
              toolName: "readFile",
              args: { path: "/test" },
            },
          ],
          usage: { promptTokens: 10, completionTokens: 5 },
          stopReason: "tool_calls",
        })
        .mockResolvedValueOnce({
          text: "Done",
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 5 },
          stopReason: "end_turn",
        });

      vi.mocked(executor.execute).mockResolvedValue({
        taskId: "call-1",
        status: "DONE",
        output: { content: "result" },
        completedAt: new Date(),
      });

      await loop.execute([{ role: "user", content: "test" }], {}, { agentType: "coding" });

      // Should check budget twice: once before first LLM call, once before tool execution
      expect(budgetCheckCount).toBeGreaterThanOrEqual(2);
    });
  });
});
