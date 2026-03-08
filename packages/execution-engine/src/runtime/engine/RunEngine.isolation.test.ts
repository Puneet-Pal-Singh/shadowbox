import { describe, expect, it } from "vitest";
import { RunEngine } from "./RunEngine.js";
import type { ILLMGateway } from "../llm/types.js";
import type { RuntimeDurableObjectState, RuntimeStorage } from "../types.js";

describe("RunEngine runId isolation", () => {
  it("keeps concurrent runs isolated by runId", async () => {
    const state = new MockRuntimeState();
    const runAId = "11111111-1111-4111-8111-111111111111";
    const runBId = "22222222-2222-4222-8222-222222222222";
    const sharedSessionId = "session-shared";
    const engineA = createEngine(state, runAId, sharedSessionId);
    const engineB = createEngine(state, runBId, sharedSessionId);

    await Promise.all([
      engineA.execute(
        { agentType: "coding", prompt: "hey", sessionId: sharedSessionId },
        [{ role: "user", content: "hey" }],
        {},
      ),
      engineB.execute(
        { agentType: "coding", prompt: "hey", sessionId: sharedSessionId },
        [{ role: "user", content: "hey" }],
        {},
      ),
    ]);

    const runA = await engineA.getRun(runAId);
    const runB = await engineB.getRun(runBId);

    expect(runA?.id).toBe(runAId);
    expect(runB?.id).toBe(runBId);
    expect(runA?.sessionId).toBe(sharedSessionId);
    expect(runB?.sessionId).toBe(sharedSessionId);
    expect(runA?.metadata.manifest).toBeDefined();
    expect(runB?.metadata.manifest).toBeDefined();
  });

  it("maintains isolated lifecycle/telemetry state across a run matrix", async () => {
    const state = new MockRuntimeState();
    const runIds = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ];
    const sessionIds = ["session-matrix-a", "session-matrix-a", "session-matrix-b"];

    const engines = runIds.map((runId, index) =>
      createEngine(state, runId, sessionIds[index] ?? "session-matrix-a"),
    );

    await Promise.all(
      engines.map((engine, index) =>
        engine.execute(
          {
            agentType: "coding",
            prompt: `hey from run ${index + 1}`,
            sessionId: sessionIds[index] ?? "session-matrix-a",
          },
          [{ role: "user", content: `hey from run ${index + 1}` }],
          {},
        ),
      ),
    );

    const runs = await Promise.all(
      engines.map((engine, index) => engine.getRun(runIds[index]!)),
    );
    const manifests = runs.map((run) => run?.metadata.manifest);
    const lifecycles = runs.map((run) =>
      run?.metadata.lifecycleSteps?.map((step) => step.step),
    );
    const wakeups = runs.map(
      (run) => run?.metadata.orchestrationTelemetry?.wakeupCount ?? 0,
    );

    expect(new Set(runs.map((run) => run?.id)).size).toBe(3);
    expect(new Set(runs.map((run) => run?.sessionId)).size).toBe(2);
    expect(manifests.every((manifest) => manifest !== undefined)).toBe(true);
    expect(
      lifecycles.every((steps) => steps?.includes("RUN_CREATED")),
    ).toBe(true);
    expect(wakeups).toEqual([1, 1, 1]);
  });
});

function createEngine(
  state: RuntimeDurableObjectState,
  runId: string,
  sessionId: string,
): RunEngine {
  return new RunEngine(
    state,
    {
      env: { NODE_ENV: "test" } as unknown,
      sessionId,
      runId,
      correlationId: `corr-${runId}`,
    },
    undefined,
    undefined,
    { llmGateway: createMockLLMGateway() },
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
