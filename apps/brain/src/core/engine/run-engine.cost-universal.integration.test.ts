import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { RunEngine } from "./RunEngine";
import { BudgetManager } from "../cost/BudgetManager";
import { CostLedger } from "../cost/CostLedger";
import { CostTracker } from "../cost/CostTracker";
import { PricingRegistry } from "../cost/PricingRegistry";
import { PricingResolver } from "../cost/PricingResolver";
import { LLMGateway } from "../llm/LLMGateway";
import type { ILLMGateway } from "../llm";
import type { Plan } from "../planner";
import type { Task } from "../task";
import type { IAgent, TaskResult } from "../../types";
import type { Env } from "../../types/ai";

describe("RunEngine universal cost coverage", () => {
  const runId = "123e4567-e89b-42d3-a456-426614174001";
  const sessionId = "session-phase-3-2";
  let state: DurableObjectState;
  let storage: Map<string, unknown>;
  let ledger: CostLedger;
  let gateway: ILLMGateway;
  let registry: PricingRegistry;
  let budgetManager: BudgetManager;

  beforeEach(async () => {
    storage = new Map<string, unknown>();
    state = createMockDurableObjectState(storage);
    registry = new PricingRegistry({
      "openai:gpt-4o": {
        inputPrice: 0.005,
        outputPrice: 0.015,
        currency: "USD",
        effectiveDate: "2026-02-13",
      },
    });
    ledger = new CostLedger(state);
    budgetManager = new BudgetManager(
      new CostTracker(state, registry, "warn"),
      registry,
      {
        maxCostPerRun: 5,
        maxCostPerSession: 20,
      },
      state,
    );
    await budgetManager.loadSessionCosts();
    gateway = new LLMGateway({
      aiService: createFakeAIService("openai", "gpt-4o"),
      budgetPolicy: budgetManager,
      costLedger: ledger,
      pricingResolver: new PricingResolver(registry, {
        unknownPricingMode: "warn",
      }),
    });
  });

  it("records cost events for planning, task, and synthesis call classes", async () => {
    const engine = new RunEngine(
      state,
      {
        env: createEnv(),
        runId,
        sessionId,
        correlationId: "corr-cost-universal",
      },
      new UniversalCostAgent(gateway),
      registry,
      {
        llmGateway: gateway,
        budgetManager,
        costLedger: ledger,
      },
    );

    const response = await engine.execute(
      {
        agentType: "coding",
        prompt: "verify universal cost coverage",
        sessionId,
      },
      [] as CoreMessage[],
      {},
    );

    expect(response.status).toBe(200);
    const events = await ledger.getEvents(runId);
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.phase).sort()).toEqual([
      "planning",
      "synthesis",
      "task",
    ]);
  });
});

class UniversalCostAgent implements IAgent {
  readonly type = "coding";

  constructor(private llmGateway: ILLMGateway) {}

  async plan(context: {
    run: import("../run").Run;
    prompt: string;
    history?: unknown;
  }): Promise<Plan> {
    const result = await this.llmGateway.generateStructured({
      context: {
        runId: context.run.id,
        sessionId: context.run.sessionId,
        agentType: this.type,
        phase: "planning",
      },
      messages: [{ role: "user", content: context.prompt }],
      schema: z.object({
        tasks: z.array(
          z.object({
            id: z.string(),
            type: z.enum(["review"]),
            description: z.string(),
            dependsOn: z.array(z.string()),
          }),
        ),
        metadata: z.object({
          estimatedSteps: z.number(),
        }),
      }),
      temperature: 0,
    });

    return result.object as Plan;
  }

  async executeTask(
    task: Task,
    context: {
      runId: string;
      sessionId: string;
      dependencies: TaskResult[];
    },
  ): Promise<TaskResult> {
    const result = await this.llmGateway.generateText({
      context: {
        runId: context.runId,
        sessionId: context.sessionId,
        taskId: task.id,
        agentType: this.type,
        phase: "task",
      },
      messages: [{ role: "user", content: task.input.description }],
    });

    return {
      taskId: task.id,
      status: "DONE",
      output: { content: result.text },
      completedAt: new Date(),
    };
  }

  async synthesize(context: {
    runId: string;
    sessionId: string;
    completedTasks: import("../../types").SerializedTask[];
    originalPrompt: string;
  }): Promise<string> {
    const result = await this.llmGateway.generateText({
      context: {
        runId: context.runId,
        sessionId: context.sessionId,
        agentType: this.type,
        phase: "synthesis",
      },
      messages: [{ role: "user", content: context.originalPrompt }],
    });
    return result.text;
  }

  getCapabilities() {
    return [];
  }
}

function createFakeAIService(provider: string, model: string) {
  const usage = {
    provider,
    model,
    promptTokens: 120,
    completionTokens: 60,
    totalTokens: 180,
  };

  return {
    getProvider: () => provider,
    getDefaultModel: () => model,
    generateText: vi.fn(async () => ({
      text: "deterministic",
      usage,
    })),
    generateStructured: vi.fn(async () => ({
      object: {
        tasks: [
          {
            id: "task-1",
            type: "review",
            description: "execute universal cost test",
            dependsOn: [],
          },
        ],
        metadata: {
          estimatedSteps: 1,
        },
      },
      usage,
    })),
    createChatStream: vi.fn(async () => {
      throw new Error("streaming is not used in this test");
    }),
  } as unknown as import("../../services/AIService").AIService;
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
    COST_UNKNOWN_PRICING_MODE: "warn",
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
