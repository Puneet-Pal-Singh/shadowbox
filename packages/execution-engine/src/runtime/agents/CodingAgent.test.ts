import { describe, expect, it, vi } from "vitest";
import { CodingAgent } from "./CodingAgent";
import type { ILLMGateway } from "../llm";
import type { RuntimeExecutionService, ExecutionContext } from "../types";
import type { Task } from "../task";

describe("CodingAgent task-phase model selection", () => {
  it("passes model/provider overrides to review task LLM calls", async () => {
    const llmGateway = createLLMGatewayMock();
    const executionService = createExecutionServiceMock();
    const agent = new CodingAgent(llmGateway, executionService);

    const task = {
      id: "task-review-1",
      runId: "run-1",
      type: "review",
      input: { description: "Review this change" },
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

function createExecutionServiceMock(): RuntimeExecutionService {
  return {
    execute: vi.fn(async () => "ok"),
  };
}
