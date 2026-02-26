import { describe, expect, it } from "vitest";
import { RunEngine } from "./RunEngine.js";
import type { PlannedTask } from "../planner/PlanSchema.js";
import type { RuntimeDurableObjectState, RuntimeStorage } from "../types.js";
import type { Task } from "../task/index.js";
import type { ILLMGateway } from "../llm/types.js";

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
    expect(privateApi.shouldBypassPlanning("fix this")).toBe(false);
  });
});

function createRunEngine(): RunEngine {
  const state = new MockRuntimeState();
  const llmGateway = createMockLLMGateway();
  return new RunEngine(
    state,
    {
      env: { NODE_ENV: "test" } as unknown,
      sessionId: "session-1",
      runId: "run-1",
    },
    undefined,
    undefined,
    { llmGateway },
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
