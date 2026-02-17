import { describe, expect, it, vi } from "vitest";
import { ReviewAgent } from "./ReviewAgent";
import type { ILLMGateway } from "../llm";
import type { RuntimeExecutionService, ExecutionContext } from "../types";
import type { Task } from "../task";

describe("ReviewAgent task-phase model selection", () => {
  it("passes model/provider overrides to analyze task LLM calls", async () => {
    const llmGateway = createLLMGatewayMock();
    const executionService = createExecutionServiceMock("file contents");
    const agent = new ReviewAgent(llmGateway, executionService);

    const task = {
      id: "task-analyze-1",
      runId: "run-1",
      type: "analyze",
      input: { description: "src/index.ts", path: "src/index.ts" },
    } as unknown as Task;

    const context: ExecutionContext = {
      runId: "run-1",
      sessionId: "session-1",
      dependencies: [],
      modelId: "gpt-4o-mini",
      providerId: "openai",
    };

    const result = await agent.executeTask(task, context);

    expect(result.status).toBe("DONE");
    expect(llmGateway.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        providerId: "openai",
      }),
    );
  });

  it("passes model/provider overrides to review task LLM calls", async () => {
    const llmGateway = createLLMGatewayMock();
    const executionService = createExecutionServiceMock("unused");
    const agent = new ReviewAgent(llmGateway, executionService);

    const task = {
      id: "task-review-2",
      runId: "run-1",
      type: "review",
      input: { description: "review this patch" },
    } as unknown as Task;

    const context: ExecutionContext = {
      runId: "run-1",
      sessionId: "session-1",
      dependencies: [],
      modelId: "gpt-4o",
      providerId: "openai",
    };

    const result = await agent.executeTask(task, context);

    expect(result.status).toBe("DONE");
    expect(llmGateway.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o",
        providerId: "openai",
      }),
    );
  });
});

function createLLMGatewayMock(): ILLMGateway {
  return {
    generateText: vi.fn(async () => ({
      text: "reviewed",
      usage: {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    })),
    generateStructured: vi.fn(),
    generateStream: vi.fn(),
  } as unknown as ILLMGateway;
}

function createExecutionServiceMock(content: string): RuntimeExecutionService {
  return {
    execute: vi.fn(async () => content),
  };
}
