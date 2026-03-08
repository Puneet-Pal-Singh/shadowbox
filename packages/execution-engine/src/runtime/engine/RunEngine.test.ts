import { describe, expect, it } from "vitest";
import { RunEngine, type RunEngineDependencies } from "./RunEngine.js";
import {
  buildConversationalSystemPrompt,
  getActionClarificationMessage,
  shouldBypassPlanning,
} from "./ConversationPolicy.js";
import { sanitizeUserFacingOutput } from "./RunOutputSanitizer.js";
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
    expect(shouldBypassPlanning("so? what is your name?")).toBe(true);
    expect(shouldBypassPlanning("what can you do?")).toBe(true);
    expect(shouldBypassPlanning("how?")).toBe(true);
    expect(shouldBypassPlanning("great")).toBe(true);
    expect(shouldBypassPlanning("sounds good")).toBe(true);
    expect(shouldBypassPlanning("check README file")).toBe(false);
    expect(shouldBypassPlanning("read this readme")).toBe(false);
    expect(shouldBypassPlanning("fix this")).toBe(false);
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
    const leaked =
      'cat: /home/sandbox/runs/5212f17b-eb1f-463f-a41f-2c4c6b9d4ba6/README.md: No such file or directory\nSee https://internal/debug';
    const sanitized = sanitizeUserFacingOutput(leaked);

    expect(sanitized).not.toContain(
      "/home/sandbox/runs/5212f17b-eb1f-463f-a41f-2c4c6b9d4ba6/",
    );
    expect(sanitized).toContain(
      "The requested file was not found in the current workspace.",
    );
    expect(sanitized).toContain("[internal-url]");
  });

  it("asks for clarification on vague file-check prompts", () => {
    expect(getActionClarificationMessage("can you check my file?")).toContain(
      "select a repository first",
    );
    expect(
      getActionClarificationMessage("can you check my file?", {
        owner: "sourcegraph",
        repo: "shadowbox",
      }),
    ).toContain("discovery step");
    expect(
      getActionClarificationMessage("check README.md", {
        owner: "sourcegraph",
        repo: "shadowbox",
      }),
    ).toBeNull();
    expect(
      getActionClarificationMessage("check this file", {
        owner: "sourcegraph",
        repo: "shadowbox",
      }),
    ).toContain("discovery step");
    expect(
      getActionClarificationMessage("check my repo?", {
        owner: "sourcegraph",
        repo: "shadowbox",
      }),
    ).toContain("discovery step");
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

  it("enforces immutable run manifest for active runs", async () => {
    const runEngine = createRunEngine();
    const privateApi = runEngine as unknown as {
      getOrCreateRun(
        input: {
          agentType: "coding";
          prompt: string;
          sessionId: string;
          providerId?: string;
          modelId?: string;
        },
        runId: string,
        sessionId: string,
      ): Promise<Run>;
    };

    await privateApi.getOrCreateRun(
      {
        agentType: "coding",
        prompt: "run once",
        sessionId: "session-1",
        providerId: "openai",
        modelId: "gpt-4o",
      },
      TEST_RUN_ID,
      "session-1",
    );

    await expect(
      privateApi.getOrCreateRun(
        {
          agentType: "coding",
          prompt: "same run id, different provider",
          sessionId: "session-1",
          providerId: "groq",
          modelId: "llama-3.3-70b-versatile",
        },
        TEST_RUN_ID,
        "session-1",
      ),
    ).rejects.toThrow("Immutable run manifest mismatch");
  });

  it("records immutable selection snapshots across planning, execution, and synthesis metadata", async () => {
    const runEngine = createRunEngine({
      llmGateway: createPlanningLLMGateway(),
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "implement a tiny command task",
        sessionId: "session-1",
        providerId: "openai",
        modelId: "gpt-4o",
        harnessId: "local-sandbox",
      },
      [{ role: "user", content: "implement a tiny command task" }],
      {},
    );

    expect(response.status).toBe(200);

    const persisted = await (runEngine as unknown as {
      getRun(runId: string): Promise<Run | null>;
    }).getRun(TEST_RUN_ID);

    const manifest = persisted?.metadata.manifest;
    const snapshots = persisted?.metadata.phaseSelectionSnapshots;
    const lifecycleSteps = persisted?.metadata.lifecycleSteps?.map(
      (entry) => entry.step,
    );
    const telemetry = persisted?.metadata.orchestrationTelemetry;

    expect(manifest).toBeDefined();
    expect(snapshots).toBeDefined();
    expect(snapshots?.planning).toEqual(manifest);
    expect(snapshots?.execution).toEqual(manifest);
    expect(snapshots?.synthesis).toEqual(manifest);
    expect(snapshots?.planning).not.toBe(manifest);
    expect(lifecycleSteps).toEqual([
      "RUN_CREATED",
      "CONTEXT_PREPARED",
      "PLAN_VALIDATED",
      "TASK_EXECUTING",
      "SYNTHESIS",
      "TERMINAL",
    ]);
    expect(telemetry?.wakeupCount).toBe(1);
    expect(telemetry?.resumeCount).toBe(0);
    expect(telemetry?.activeDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("tracks wakeups and resumptions for pre-existing active runs", async () => {
    const runEngine = createRunEngine({
      llmGateway: createPlanningLLMGateway(),
    });
    const privateApi = runEngine as unknown as {
      getOrCreateRun(
        input: {
          agentType: "coding";
          prompt: string;
          sessionId: string;
          providerId?: string;
          modelId?: string;
        },
        runId: string,
        sessionId: string,
      ): Promise<Run>;
      runRepo: {
        update(run: Run): Promise<void>;
      };
      getRun(runId: string): Promise<Run | null>;
    };

    const preexistingRun = await privateApi.getOrCreateRun(
      {
        agentType: "coding",
        prompt: "resume marker",
        sessionId: "session-1",
      },
      TEST_RUN_ID,
      "session-1",
    );
    preexistingRun.metadata.orchestrationTelemetry = {
      activeDurationMs: 10,
      wakeupCount: 1,
      resumeCount: 0,
      lastWakeupAt: new Date(Date.now() - 5_000).toISOString(),
    };
    await privateApi.runRepo.update(preexistingRun);

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "continue with a deterministic plan",
        sessionId: "session-1",
      },
      [{ role: "user", content: "continue with a deterministic plan" }],
      {},
    );

    expect(response.status).toBe(200);

    const persisted = await privateApi.getRun(TEST_RUN_ID);
    expect(persisted?.metadata.orchestrationTelemetry?.wakeupCount).toBe(2);
    expect(persisted?.metadata.orchestrationTelemetry?.resumeCount).toBe(1);
    expect(
      persisted?.metadata.orchestrationTelemetry?.activeDurationMs ?? 0,
    ).toBeGreaterThanOrEqual(10);
  });

  it("builds conversational system prompt with direct-answer style guidance", () => {
    const prompt = buildConversationalSystemPrompt();
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

  it("forces platform approval gate when delegated harness mode is untrusted", async () => {
    const runEngine = createRunEngine({
      llmGateway: createPlanningLLMGateway(),
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "check repository acme/platform-core README.md",
        sessionId: "session-1",
        harnessMode: "delegated",
        repositoryContext: {
          owner: "sourcegraph",
          repo: "shadowbox",
        },
      },
      [{ role: "user", content: "check repository acme/platform-core README.md" }],
      {},
    );

    expect(response.status).toBe(200);
    const output = await response.text();

    const persisted = await (runEngine as unknown as {
      getRun(runId: string): Promise<Run | null>;
    }).getRun(TEST_RUN_ID);

    const lifecycleSteps = persisted?.metadata.lifecycleSteps?.map(
      (entry) => entry.step,
    );

    expect(lifecycleSteps).toContain("APPROVAL_WAIT");
    expect(persisted?.metadata.manifest?.harnessMode).toBe("platform_owned");
    expect(output).toContain("approve cross-repo acme/platform-core");
    expect(persisted?.status).toBe("COMPLETED");
  });

  it("skips platform approval gate when delegated mode is internally authorized", async () => {
    const runEngine = createRunEngine({
      llmGateway: createPlanningLLMGateway(),
    });

    const response = await runEngine.execute(
      {
        agentType: "coding",
        prompt: "check repository acme/platform-core README.md",
        sessionId: "session-1",
        harnessMode: "delegated",
        metadata: {
          internal: { allowDelegatedHarnessMode: true },
        },
        repositoryContext: {
          owner: "sourcegraph",
          repo: "shadowbox",
        },
      },
      [{ role: "user", content: "check repository acme/platform-core README.md" }],
      {},
    );

    expect(response.status).toBe(200);

    const persisted = await (runEngine as unknown as {
      getRun(runId: string): Promise<Run | null>;
    }).getRun(TEST_RUN_ID);

    const lifecycleSteps = persisted?.metadata.lifecycleSteps?.map(
      (entry) => entry.step,
    );

    expect(lifecycleSteps).not.toContain("APPROVAL_WAIT");
    expect(persisted?.metadata.manifest?.harnessMode).toBe("delegated");
    expect(persisted?.status).toBe("COMPLETED");
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

function createPlanningLLMGateway(): ILLMGateway {
  return {
    generateText: async () => ({
      text: "Execution complete",
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 5,
        completionTokens: 5,
        totalTokens: 10,
      },
    }),
    generateStructured: async () => ({
      object: {
        tasks: [
          {
            id: "task-1",
            type: "shell",
            description: "Echo a deterministic marker",
            dependsOn: [],
            input: { command: "echo done" },
          },
        ],
        metadata: { estimatedSteps: 1 },
      },
      usage: {
        provider: "mock",
        model: "mock-model",
        promptTokens: 5,
        completionTokens: 5,
        totalTokens: 10,
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
