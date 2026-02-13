import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage } from "ai";
import { z } from "zod";
import { RunEngine } from "./RunEngine";
import { CostLedger } from "../cost/CostLedger";
import { CostTracker } from "../cost/CostTracker";
import { BudgetManager, BudgetExceededError } from "../cost/BudgetManager";
import { PricingRegistry } from "../cost/PricingRegistry";
import { PricingResolver } from "../cost/PricingResolver";
import { LLMGateway, UnknownPricingError } from "../llm/LLMGateway";
import type { ILLMGateway } from "../llm";
import type { Env } from "../../types/ai";
import type { IAgent, TaskResult } from "../../types";
import type { Task } from "../task";
import type { Plan } from "../planner";

describe("RunEngine cost integrity", () => {
  let storage: Map<string, unknown>;
  let ctx: DurableObjectState;
  let costLedger: CostLedger;
  let pricingRegistry: PricingRegistry;
  let budgetManager: BudgetManager;

  const runId = "123e4567-e89b-42d3-a456-426614174000";
  const sessionId = "session-phase-3-1";

  beforeEach(async () => {
    storage = new Map<string, unknown>();
    ctx = createMockDurableObjectState(storage);

    pricingRegistry = new PricingRegistry({
      "openai:gpt-4o": {
        inputPrice: 0.005,
        outputPrice: 0.015,
        currency: "USD",
        effectiveDate: "2026-02-13",
      },
    });
    costLedger = new CostLedger(ctx);
    const costTracker = new CostTracker(ctx, pricingRegistry, "warn");
    budgetManager = new BudgetManager(
      costTracker,
      pricingRegistry,
      {
        maxCostPerRun: 5,
        maxCostPerSession: 20,
        warningThreshold: 0.8,
      },
      ctx,
    );
    await budgetManager.loadSessionCosts();
  });

  it("emits cost events for planning, task, and synthesis via gateway", async () => {
    const llmGateway = createGateway({
      provider: "openai",
      model: "gpt-4o",
      pricingRegistry,
      budgetManager,
      costLedger,
    });
    const agent = new TestAgent(llmGateway);
    const engine = new RunEngine(
      ctx,
      {
        env: createEnv(),
        runId,
        sessionId,
        correlationId: "corr-1",
      },
      agent,
      pricingRegistry,
      {
        llmGateway,
        budgetManager,
        costLedger,
      },
    );

    const response = await engine.execute(
      {
        agentType: "coding",
        prompt: "Run deterministic integration test",
        sessionId,
      },
      [] as CoreMessage[],
      {},
    );
    expect(response.status).toBe(200);

    const events = await costLedger.getEvents(runId);
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.runId === runId)).toBe(true);
    expect(events.every((event) => event.sessionId === sessionId)).toBe(true);

    const snapshot = await costLedger.aggregate(runId);
    const eventSum = events.reduce((sum, event) => sum + event.calculatedCostUsd, 0);
    expect(snapshot.totalCost).toBeCloseTo(eventSum, 8);
    expect(snapshot.eventCount).toBe(3);

    const duplicate = {
      ...events[0],
      eventId: "duplicate-event",
      calculatedCostUsd: 999,
    };
    await costLedger.append(duplicate);
    const deduped = await costLedger.getEvents(runId);
    expect(deduped).toHaveLength(3);
  });

  it("blocks requests when budget policy denies preflight", async () => {
    const strictBudget = new BudgetManager(
      new CostTracker(ctx, pricingRegistry, "warn"),
      pricingRegistry,
      {
        maxCostPerRun: 0.00001,
        maxCostPerSession: 0.00001,
        warningThreshold: 0.8,
      },
      ctx,
    );
    await strictBudget.loadSessionCosts();

    const llmGateway = createGateway({
      provider: "openai",
      model: "gpt-4o",
      pricingRegistry,
      budgetManager: strictBudget,
      costLedger,
    });

    await expect(
      llmGateway.generateText({
        context: {
          runId,
          sessionId,
          agentType: "coding",
          phase: "task",
        },
        messages: [{ role: "user", content: "Budget check request" }],
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("applies unknown pricing mode and blocks when configured", async () => {
    const blockingResolver = new PricingResolver(pricingRegistry, {
      unknownPricingMode: "block",
    });
    const llmGateway = new LLMGateway({
      aiService: createFakeAIService("unknown", "unseeded-model"),
      budgetPolicy: budgetManager,
      costLedger,
      pricingResolver: blockingResolver,
    });

    await expect(
      llmGateway.generateText({
        context: {
          runId,
          sessionId,
          agentType: "coding",
          phase: "task",
        },
        messages: [{ role: "user", content: "Unknown pricing model" }],
      }),
    ).rejects.toBeInstanceOf(UnknownPricingError);

    const events = await costLedger.getEvents(runId);
    expect(events).toHaveLength(0);
  });
});

class TestAgent implements IAgent {
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
            type: z.enum(["analyze", "edit", "test", "review", "git", "shell"]),
            description: z.string(),
            dependsOn: z.array(z.string()),
            expectedOutput: z.string().optional(),
          }),
        ),
        metadata: z.object({
          estimatedSteps: z.number(),
          reasoning: z.string().optional(),
        }),
      }),
      temperature: 0,
    });

    return result.object as Plan;
  }

  async executeTask(task: Task, context: {
    runId: string;
    sessionId: string;
    dependencies: TaskResult[];
  }): Promise<TaskResult> {
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

function createGateway(input: {
  provider: string;
  model: string;
  pricingRegistry: PricingRegistry;
  budgetManager: BudgetManager;
  costLedger: CostLedger;
}): ILLMGateway {
  return new LLMGateway({
    aiService: createFakeAIService(input.provider, input.model),
    budgetPolicy: input.budgetManager,
    costLedger: input.costLedger,
    pricingResolver: new PricingResolver(input.pricingRegistry, {
      unknownPricingMode: "warn",
    }),
  });
}

function createFakeAIService(provider: string, model: string) {
  const usage = {
    provider,
    model,
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
  };

  return {
    getProvider: () => provider,
    getDefaultModel: () => model,
    generateText: vi.fn(async () => ({
      text: "deterministic-text",
      usage,
    })),
    generateStructured: vi.fn(async () => ({
      object: {
        tasks: [
          {
            id: "1",
            type: "review",
            description: "Review deterministic task",
            dependsOn: [],
            expectedOutput: "summary",
          },
        ],
        metadata: {
          estimatedSteps: 1,
          reasoning: "test",
        },
      },
      usage,
    })),
    createChatStream: vi.fn(async () => {
      throw new Error("Streaming path not used in this test");
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
        const result = new Map<string, T>();
        for (const [key, value] of storage.entries()) {
          if (options?.prefix && !key.startsWith(options.prefix)) {
            continue;
          }
          if (options?.start && key < options.start) {
            continue;
          }
          if (options?.end && key > options.end) {
            continue;
          }
          result.set(key, value as T);
        }
        return result;
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
