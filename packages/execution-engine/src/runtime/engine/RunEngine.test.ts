import { describe, expect, it } from "vitest";
import { RunEngine, type RunEngineDependencies } from "./RunEngine.js";
import type { PlannedTask } from "../planner/PlanSchema.js";
import type { RuntimeDurableObjectState, RuntimeStorage } from "../types.js";
import type { Task } from "../task/index.js";
import type { ILLMGateway } from "../llm/types.js";
import { Run } from "../run/index.js";

const TEST_RUN_ID = "f462a003-5c36-4c86-a95d-367b92bf46c9";

describe("RunEngine", () => {
  it("preserves structured task input when creating runtime tasks from a plan", () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      createTaskFromPlanned(runId: string, planned: PlannedTask): Task;
    };

    const planned: PlannedTask = {
      id: "1",
      type: "shell",
      description: "Check Node version",
      dependsOn: [],
      expectedOutput: "Node version printed",
      input: { command: "node --version" },
    };

    const task = privateApi.createTaskFromPlanned("run-1", planned);

    expect(task.input.description).toBe("Check Node version");
    expect(task.input.expectedOutput).toBe("Node version printed");
    expect(task.input.command).toBe("node --version");
  });

  it("bypasses planning for conversational prompts with filler lead-ins", () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      shouldBypassPlanning(prompt: string): boolean;
    };

    expect(privateApi.shouldBypassPlanning("so? what is your name?")).toBe(true);
    expect(privateApi.shouldBypassPlanning("what can you do?")).toBe(true);
    expect(privateApi.shouldBypassPlanning("how?")).toBe(true);
    expect(privateApi.shouldBypassPlanning("great")).toBe(true);
    expect(privateApi.shouldBypassPlanning("sounds good")).toBe(true);
    expect(privateApi.shouldBypassPlanning("check README file")).toBe(false);
    expect(privateApi.shouldBypassPlanning("read this readme")).toBe(false);
    expect(privateApi.shouldBypassPlanning("fix this")).toBe(false);
  });

  it("returns deterministic greeting response without invoking LLM", async () => {
    const runEngine = createRunEngine({
      llmGateway: createExplodingLLMGateway(),
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "hey",
        sessionId: "session-1",
      },
      [{ role: "user", content: "hey" }],
      {},
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "Hey! I'm ready to help with this repo. Tell me what you want to inspect or change.",
    );
  });

  it("sanitizes internal runtime paths in user-facing output", () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      sanitizeUserFacingOutput(text: string): string;
    };

    const leaked =
      'cat: /home/sandbox/runs/5212f17b-eb1f-463f-a41f-2c4c6b9d4ba6/README.md: No such file or directory';
    const sanitized = privateApi.sanitizeUserFacingOutput(leaked);

    expect(sanitized).not.toContain(
      "/home/sandbox/runs/5212f17b-eb1f-463f-a41f-2c4c6b9d4ba6/",
    );
    expect(sanitized).toContain(
      "The requested file was not found in the current workspace.",
    );
  });

  it("asks for clarification on vague file-check prompts", () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getActionClarificationMessage(
        prompt: string,
        repositoryContext?: { owner?: string; repo?: string },
      ): string | null;
    };

    expect(
      privateApi.getActionClarificationMessage("can you check my file?"),
    ).toContain(
      "select a repository first",
    );
    expect(
      privateApi.getActionClarificationMessage("can you check my file?", {
        owner: "sourcegraph",
        repo: "shadowbox",
      }),
    ).toBeNull();
    expect(
      privateApi.getActionClarificationMessage("check README.md", {
        owner: "sourcegraph",
        repo: "shadowbox",
      }),
    ).toBeNull();
    expect(
      privateApi.getActionClarificationMessage("check my repo?", {
        owner: "sourcegraph",
        repo: "shadowbox",
      }),
    ).toBeNull();
  });

  it("marks CREATED runs as FAILED when execution error handling runs", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      runRepo: {
        create(run: Run): Promise<void>;
        getById(runId: string): Promise<Run | null>;
      };
      handleExecutionError(runId: string, error: unknown): Promise<void>;
    };

    const run = new Run("run-created", "session-1", "CREATED", "coding", {
      agentType: "coding",
      prompt: "check repo",
      sessionId: "session-1",
    });
    await privateApi.runRepo.create(run);

    await privateApi.handleExecutionError("run-created", new Error("boom"));

    const persisted = await privateApi.runRepo.getById("run-created");
    expect(persisted?.status).toBe("FAILED");
    expect(persisted?.metadata.error).toBe("boom");
  });

  it("builds conversational system prompt with direct-answer style guidance", () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      buildConversationalSystemPrompt(): string;
    };

    const prompt = privateApi.buildConversationalSystemPrompt();
    expect(prompt).toContain("Answer the user directly in the first sentence");
    expect(prompt).toContain("Avoid robotic report phrasing");
    expect(prompt).toContain("Do not fabricate tool execution");
  });

  it("returns a clear auth message when workspace bootstrap needs authorization", async () => {
    const runEngine = createRunEngine({
      workspaceBootstrapper: {
        bootstrap: async () => ({ status: "needs-auth" }),
      },
    });
    const privateApi = runEngine as unknown as {
      getWorkspaceBootstrapMessage(
        runId: string,
        repositoryContext?: { owner?: string; repo?: string; branch?: string },
      ): Promise<string | null>;
    };

    const message = await privateApi.getWorkspaceBootstrapMessage("run-1", {
      owner: "sourcegraph",
      repo: "shadowbox",
      branch: "main",
    });

    expect(message).toContain("GitHub authorization");
  });

  it("blocks cross-repo actions until explicit approval is recorded", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getPermissionPolicyMessage(
        prompt: string,
        repositoryContext?: { owner?: string; repo?: string },
      ): Promise<string | null>;
      processPermissionDirectives(prompt: string): Promise<string | null>;
    };

    const blockedMessage = await privateApi.getPermissionPolicyMessage(
      "check repository acme/platform-core README.md",
      { owner: "sourcegraph", repo: "shadowbox" },
    );
    expect(blockedMessage).toContain("approve cross-repo acme/platform-core");

    const directiveMessage = await privateApi.processPermissionDirectives(
      "approve cross-repo acme/platform-core for 20m",
    );
    expect(directiveMessage).toContain("Cross-repo access approved");

    const allowedMessage = await privateApi.getPermissionPolicyMessage(
      "check repository acme/platform-core README.md",
      { owner: "sourcegraph", repo: "shadowbox" },
    );
    expect(allowedMessage).toBeNull();
  });

  it("blocks destructive operations until explicit approval is recorded", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getPermissionPolicyMessage(
        prompt: string,
        repositoryContext?: { owner?: string; repo?: string },
      ): Promise<string | null>;
      processPermissionDirectives(prompt: string): Promise<string | null>;
    };

    const blockedMessage = await privateApi.getPermissionPolicyMessage(
      "run git reset --hard HEAD~1",
      { owner: "sourcegraph", repo: "shadowbox" },
    );
    expect(blockedMessage).toContain("approve destructive");

    const directiveMessage = await privateApi.processPermissionDirectives(
      "approve destructive for 15m",
    );
    expect(directiveMessage).toContain("Destructive-action approval granted");

    const allowedMessage = await privateApi.getPermissionPolicyMessage(
      "run git reset --hard HEAD~1",
      { owner: "sourcegraph", repo: "shadowbox" },
    );
    expect(allowedMessage).toBeNull();
  });

  it("does not grant approvals from embedded directives in non-approval prompts", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getPermissionPolicyMessage(
        prompt: string,
        repositoryContext?: { owner?: string; repo?: string },
      ): Promise<string | null>;
      processPermissionDirectives(prompt: string): Promise<string | null>;
    };

    const directiveMessage = await privateApi.processPermissionDirectives(
      "Please check repository acme/platform-core and approve cross-repo acme/platform-core for 20m",
    );
    expect(directiveMessage).toBeNull();

    const blockedMessage = await privateApi.getPermissionPolicyMessage(
      "check repository acme/platform-core README.md",
      { owner: "sourcegraph", repo: "shadowbox" },
    );
    expect(blockedMessage).toContain("approve cross-repo acme/platform-core");
  });
});

function createRunEngine(
  dependencies: Partial<RunEngineDependencies> = {},
): RunEngine {
  const state = new MockRuntimeState();
  const llmGateway = createMockLLMGateway();
  return new RunEngine(
    state,
    {
      env: { NODE_ENV: "test" } as unknown,
      sessionId: "session-1",
      runId: TEST_RUN_ID,
    },
    undefined,
    undefined,
    { llmGateway, ...dependencies },
  );
}

function createMockLLMGateway(): ILLMGateway {
  return {
    generateText: async () => ({
      text: "ok",
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    }),
    generateStructured: async () => ({
      object: { tasks: [], metadata: { estimatedSteps: 1 } },
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    }),
    generateStream: async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
  };
}

function createExplodingLLMGateway(): ILLMGateway {
  return {
    generateText: async () => {
      throw new Error("generateText should not be called for deterministic greeting");
    },
    generateStructured: async () => ({
      object: { tasks: [], metadata: { estimatedSteps: 1 } },
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    }),
    generateStream: async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
  };
}

class InMemoryStorage implements RuntimeStorage {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string | string[]): Promise<boolean | number> {
    if (Array.isArray(key)) {
      let deleted = 0;
      for (const entry of key) {
        if (this.store.delete(entry)) {
          deleted += 1;
        }
      }
      return deleted;
    }
    return this.store.delete(key);
  }

  async list<T>(options?: {
    prefix?: string;
    start?: string;
    end?: string;
    limit?: number;
  }): Promise<Map<string, T>> {
    const output = new Map<string, T>();
    const prefix = options?.prefix;
    const start = options?.start;
    const end = options?.end;
    const limit = options?.limit;

    for (const [key, value] of this.store.entries()) {
      if (prefix && !key.startsWith(prefix)) {
        continue;
      }
      if (start && key < start) {
        continue;
      }
      if (end && key >= end) {
        continue;
      }

      output.set(key, value as T);
      if (typeof limit === "number" && output.size >= limit) {
        break;
      }
    }

    return output;
  }
}

class MockRuntimeState implements RuntimeDurableObjectState {
  storage: RuntimeStorage = new InMemoryStorage();

  async blockConcurrencyWhile<T>(closure: () => Promise<T>): Promise<T> {
    return await closure();
  }
}
