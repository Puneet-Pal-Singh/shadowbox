import { beforeEach, describe, expect, it } from "vitest";
import type { DurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage } from "ai";
import { RunEngine } from "./RunEngine";
import type { Plan } from "../planner";
import type { Task } from "../task";
import type { IAgent, SerializedTask, TaskResult } from "../../types";
import type { Env } from "../../types/ai";
import type {
  MemoryEvent,
  MemorySnapshot,
} from "@shadowbox/execution-engine/runtime";

describe("RunEngine session memory continuity", () => {
  let sessionMemoryClient: InMemorySessionMemoryClient;

  beforeEach(() => {
    sessionMemoryClient = new InMemorySessionMemoryClient();
  });

  it("retrieves session memory across different run IDs in the same session", async () => {
    const sessionId = "session-memory-shared";
    const firstRunId = crypto.randomUUID();
    const secondRunId = crypto.randomUUID();

    const firstEngine = createEngine({
      runId: firstRunId,
      sessionId,
      sessionMemoryClient,
    });

    const firstResponse = await firstEngine.execute(
      {
        agentType: "coding",
        prompt: "first run writes session memory",
        sessionId,
      },
      createSeedMessages("first run seed"),
      {},
    );
    expect(firstResponse.status).toBe(200);
    expect(sessionMemoryClient.getEventCount(sessionId)).toBeGreaterThan(0);

    const secondEngine = createEngine({
      runId: secondRunId,
      sessionId,
      sessionMemoryClient,
    });

    const secondResponse = await secondEngine.execute(
      {
        agentType: "coding",
        prompt: "second run should retrieve prior session memory",
        sessionId,
      },
      [] as CoreMessage[],
      {},
    );
    expect(secondResponse.status).toBe(200);
    expect(sessionMemoryClient.lastContextRequest?.sessionId).toBe(sessionId);
    expect(sessionMemoryClient.lastContextRequest?.prompt).toContain(
      "second run",
    );
    expect(sessionMemoryClient.lastReturnedEvents).toBeGreaterThan(0);
  });

  it("does not leak memory across sessions", async () => {
    const sourceSessionId = "session-memory-source";
    const isolatedSessionId = "session-memory-isolated";

    const sourceEngine = createEngine({
      runId: crypto.randomUUID(),
      sessionId: sourceSessionId,
      sessionMemoryClient,
    });

    await sourceEngine.execute(
      {
        agentType: "coding",
        prompt: "seed session memory",
        sessionId: sourceSessionId,
      },
      createSeedMessages("source session seed"),
      {},
    );
    expect(sessionMemoryClient.getEventCount(sourceSessionId)).toBeGreaterThan(
      0,
    );

    const isolatedEngine = createEngine({
      runId: crypto.randomUUID(),
      sessionId: isolatedSessionId,
      sessionMemoryClient,
    });

    const isolatedResponse = await isolatedEngine.execute(
      {
        agentType: "coding",
        prompt: "isolated session should not receive prior memory",
        sessionId: isolatedSessionId,
      },
      [] as CoreMessage[],
      {},
    );
    expect(isolatedResponse.status).toBe(200);
    expect(sessionMemoryClient.lastContextRequest?.sessionId).toBe(
      isolatedSessionId,
    );
    expect(sessionMemoryClient.lastReturnedEvents).toBe(0);
  });
});

function createEngine(params: {
  runId: string;
  sessionId: string;
  sessionMemoryClient: InMemorySessionMemoryClient;
}): RunEngine {
  const state = createMockDurableObjectState(new Map<string, unknown>());

  return new RunEngine(
    state,
    {
      env: createEnv(),
      runId: params.runId,
      sessionId: params.sessionId,
      correlationId: `corr-${params.runId}`,
    },
    new SessionMemorySignalAgent(),
    undefined,
    {
      aiService: createFakeAIService(),
      sessionMemoryClient: params.sessionMemoryClient,
    },
  );
}

function createSeedMessages(seedLabel: string): CoreMessage[] {
  return [
    {
      role: "user",
      content: [
        `decision: Keep session continuity marker ${seedLabel}.`,
        `fact: Session memory should be retrievable for ${seedLabel}.`,
      ].join("\n"),
    },
  ] as CoreMessage[];
}

class SessionMemorySignalAgent implements IAgent {
  readonly type = "coding";

  async plan(context: {
    run: import("../run").Run;
    prompt: string;
    history?: unknown;
  }): Promise<Plan> {
    return {
      tasks: [
        {
          id: crypto.randomUUID(),
          type: "review",
          description: `plan for ${context.prompt}`,
          dependsOn: [],
        },
      ],
      metadata: { estimatedSteps: 1 },
    };
  }

  async executeTask(task: Task): Promise<TaskResult> {
    return {
      taskId: task.id,
      status: "DONE",
      output: { content: "task completed" },
      completedAt: new Date(),
    };
  }

  async synthesize(context: {
    runId: string;
    sessionId: string;
    completedTasks: SerializedTask[];
    originalPrompt: string;
  }): Promise<string> {
    return [
      `decision: Preserve session continuity for run ${context.runId}.`,
      `fact: Session ${context.sessionId} retains memory across runs.`,
      `todo: follow up on prompt ${context.originalPrompt}`,
    ].join("\n");
  }

  getCapabilities() {
    return [];
  }
}

class InMemorySessionMemoryClient {
  private eventsBySession = new Map<string, MemoryEvent[]>();
  private snapshotsBySession = new Map<string, MemorySnapshot>();
  public lastContextRequest?: { sessionId: string; prompt: string; limit?: number };
  public lastReturnedEvents = 0;

  async appendSessionMemory(event: unknown): Promise<boolean> {
    const parsed = event as MemoryEvent;
    if (parsed.scope !== "session") {
      return false;
    }

    const events = this.eventsBySession.get(parsed.sessionId) ?? [];
    if (events.some((existing) => existing.idempotencyKey === parsed.idempotencyKey)) {
      return false;
    }

    events.push(parsed);
    this.eventsBySession.set(parsed.sessionId, events);
    return true;
  }

  async getSessionMemoryContext(
    sessionId: string,
    prompt: string,
    limit?: number,
  ): Promise<{ events: unknown[]; snapshot?: unknown }> {
    this.lastContextRequest = { sessionId, prompt, limit };
    const events = this.eventsBySession.get(sessionId) ?? [];
    const limitedEvents = typeof limit === "number" ? events.slice(0, limit) : events;
    this.lastReturnedEvents = limitedEvents.length;
    return {
      events: limitedEvents,
      snapshot: this.snapshotsBySession.get(sessionId),
    };
  }

  async getSessionSnapshot(sessionId: string): Promise<unknown | undefined> {
    return this.snapshotsBySession.get(sessionId);
  }

  async upsertSessionSnapshot(snapshot: unknown): Promise<void> {
    const parsed = snapshot as MemorySnapshot;
    this.snapshotsBySession.set(parsed.sessionId, parsed);
  }

  getEventCount(sessionId: string): number {
    return (this.eventsBySession.get(sessionId) ?? []).length;
  }
}

function createEnv(): Env {
  return {
    AI: {} as Env["AI"],
    SECURE_API: {} as Env["SECURE_API"],
    GITHUB_CLIENT_ID: "x",
    GITHUB_CLIENT_SECRET: "x",
    GITHUB_REDIRECT_URI: "x",
    GITHUB_TOKEN_ENCRYPTION_KEY: "x",
    SESSION_SECRET: "x",
    FRONTEND_URL: "x",
    SESSIONS: {} as Env["SESSIONS"],
    RUN_ENGINE_RUNTIME: {} as Env["RUN_ENGINE_RUNTIME"],
    SESSION_MEMORY_RUNTIME: {} as Env["SESSION_MEMORY_RUNTIME"],
    COST_UNKNOWN_PRICING_MODE: "warn",
  };
}

function createFakeAIService() {
  return {
    getProvider: () => "openai",
    getDefaultModel: () => "gpt-4o",
    generateText: async () => ({
      text: "ok",
      usage: {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    }),
    generateStructured: async () => ({
      object: { tasks: [], metadata: { estimatedSteps: 0 } },
      usage: {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    }),
    createChatStream: async () => {
      throw new Error("streaming not used in this test");
    },
  };
}

function createMockDurableObjectState(
  storage: Map<string, unknown>,
): DurableObjectState {
  return {
    storage: {
      get: async <T>(key: string): Promise<T | undefined> =>
        storage.get(key) as T | undefined,
      put: async <T>(key: string, value: T): Promise<void> => {
        storage.set(key, value);
      },
      delete: async (key: string): Promise<boolean> => {
        storage.delete(key);
        return true;
      },
      list: async <T>(options?: {
        prefix?: string;
        start?: string;
        end?: string;
      }): Promise<Map<string, T>> => {
        const output = new Map<string, T>();
        for (const [key, value] of storage.entries()) {
          if (options?.prefix && !key.startsWith(options.prefix)) {
            continue;
          }
          if (options?.start && key < options.start) {
            continue;
          }
          if (options?.end && key >= options.end) {
            continue;
          }
          output.set(key, value as T);
        }
        return output;
      },
      transaction: async <T>(
        closure: (txn: unknown) => Promise<T>,
      ): Promise<T> => closure({}),
      blockConcurrencyWhile: async <T>(closure: () => Promise<T>): Promise<T> =>
        closure(),
    } as unknown as DurableObjectState["storage"],
    id: { toString: () => "mock-do" } as DurableObjectState["id"],
    waitUntil: async (promise: Promise<unknown>): Promise<void> => {
      await promise;
    },
    blockConcurrencyWhile: async <T>(closure: () => Promise<T>): Promise<T> =>
      closure(),
  } as unknown as DurableObjectState;
}
