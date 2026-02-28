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

  it("returns FAILED when filesystem read returns plugin failure", async () => {
    const llmGateway = createLLMGatewayMock();
    const executionService = {
      execute: vi.fn(async () => ({
        success: false,
        error: "cat: README.md: No such file or directory",
      })),
    } as unknown as RuntimeExecutionService;
    const agent = new CodingAgent(llmGateway, executionService);

    const task = {
      id: "task-analyze-1",
      runId: "run-1",
      type: "analyze",
      input: { description: "Check README", path: "README.md" },
    } as unknown as Task;

    const context: ExecutionContext = {
      runId: "run-1",
      sessionId: "session-1",
      dependencies: [],
    };

    const result = await agent.executeTask(task, context);

    expect(result.status).toBe("FAILED");
    expect(result.error?.message).toContain("No such file or directory");
  });

  it("normalizes @readme path aliases before analyze execution", async () => {
    const llmGateway = createLLMGatewayMock();
    const execute = vi.fn(async () => ({ success: true, output: "ok" }));
    const executionService = {
      execute,
    } as unknown as RuntimeExecutionService;
    const agent = new CodingAgent(llmGateway, executionService);

    const task = {
      id: "task-analyze-2",
      runId: "run-1",
      type: "analyze",
      input: { description: "check @readme", path: "@readme" },
    } as unknown as Task;

    const context: ExecutionContext = {
      runId: "run-1",
      sessionId: "session-1",
      dependencies: [],
    };

    const result = await agent.executeTask(task, context);

    expect(result.status).toBe("DONE");
    expect(execute).toHaveBeenCalledWith("filesystem", "read_file", {
      path: "README.md",
    });
  });

  it("routes ls shell commands to filesystem list_files", async () => {
    const llmGateway = createLLMGatewayMock();
    const execute = vi.fn(async () => ({ success: true, output: "README.md" }));
    const executionService = { execute } as unknown as RuntimeExecutionService;
    const agent = new CodingAgent(llmGateway, executionService);

    const task = {
      id: "task-shell-ls",
      runId: "run-1",
      type: "shell",
      input: { description: "list files", command: "ls -la src" },
    } as unknown as Task;

    const context: ExecutionContext = {
      runId: "run-1",
      sessionId: "session-1",
      dependencies: [],
    };

    const result = await agent.executeTask(task, context);
    expect(result.status).toBe("DONE");
    expect(execute).toHaveBeenCalledWith("filesystem", "list_files", {
      path: "src",
    });
  });

  it("fails fast on git shell commands", async () => {
    const llmGateway = createLLMGatewayMock();
    const execute = vi.fn(async () => "ok");
    const executionService = { execute } as unknown as RuntimeExecutionService;
    const agent = new CodingAgent(llmGateway, executionService);

    const task = {
      id: "task-shell-git",
      runId: "run-1",
      type: "shell",
      input: { description: "inspect repo", command: "git status" },
    } as unknown as Task;

    const context: ExecutionContext = {
      runId: "run-1",
      sessionId: "session-1",
      dependencies: [],
    };

    const result = await agent.executeTask(task, context);
    expect(result.status).toBe("FAILED");
    expect(result.error?.message).toContain("Git shell commands are not allowed");
    expect(execute).not.toHaveBeenCalled();
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
