import type { DurableObjectState as LegacyDurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage } from "ai";
import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { RunEngine } from "../core/engine/RunEngine";
import { tagRuntimeStateSemantics } from "@shadowbox/execution-engine/runtime";
import type { Env } from "../types/ai";
import { AIService } from "../services/AIService";
import { ExecutionService } from "../services/ExecutionService";
import { AgentRegistry, CodingAgent, ReviewAgent } from "../core/agents";
import { SessionMemoryClient } from "../services/memory/SessionMemoryClient";
import {
  LLMGateway,
  PricingResolver,
  PricingRegistry,
  BudgetManager,
  CostLedger,
  CostTracker,
} from "@shadowbox/execution-engine/runtime";
import type {
  AgentType,
  IAgent,
  LLMRuntimeAIService,
  RunEngineDependencies,
} from "@shadowbox/execution-engine/runtime";

// Basic message validation schema
const CoreMessageSchema = z.union([
  z.object({ role: z.literal("system"), content: z.string() }),
  z.object({ role: z.literal("user"), content: z.unknown() }),
  z.object({
    role: z.literal("assistant"),
    content: z.unknown(),
    tool_calls: z.array(z.unknown()).optional(),
  }),
  z.object({
    role: z.literal("tool"),
    content: z.unknown(),
    tool_call_id: z.string(),
  }),
]);

const ExecuteRunPayloadSchema = z.object({
  runId: z.string().min(1),
  sessionId: z.string().min(1),
  correlationId: z.string().min(1),
  requestOrigin: z.string().optional(),
  input: z.object({
    agentType: z.enum(["coding", "review", "ci"]),
    prompt: z.string().min(1),
    sessionId: z.string().min(1),
    providerId: z.string().min(1).optional(),
    modelId: z.string().min(1).optional(),
  }),
  messages: z.array(CoreMessageSchema),
});

// Validate provider/model override pair: both must be set or both must be omitted
const validateProviderModelPair = (payload: ExecuteRunPayload) => {
  const { providerId, modelId } = payload.input;
  const hasProviderId = providerId !== undefined && providerId !== null;
  const hasModelId = modelId !== undefined && modelId !== null;
  
  if (hasProviderId !== hasModelId) {
    throw new Error(
      "Provider and model overrides must both be set or both be omitted"
    );
  }
};

type ExecuteRunPayload = z.infer<typeof ExecuteRunPayloadSchema>;

export class RunEngineRuntime extends DurableObject {
  private executionQueue: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/execute") {
      return new Response("Not Found", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let payload: ExecuteRunPayload;
    try {
      payload = ExecuteRunPayloadSchema.parse(await request.json());
      validateProviderModelPair(payload);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Invalid payload";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      return await this.withExecutionLock(async () => {
        const runtimeState = tagRuntimeStateSemantics(
          this.ctx as unknown as LegacyDurableObjectState,
          "do",
        );

        const dependencies = this.buildRuntimeDependencies(payload);

        const runEngine = new RunEngine(
          runtimeState,
          {
            env: this.env as Env,
            sessionId: payload.sessionId,
            runId: payload.runId,
            correlationId: payload.correlationId,
            requestOrigin: payload.requestOrigin,
          },
          dependencies.agent,
          undefined,
          dependencies.runEngineDeps,
        );

        // Messages validated by zod schema above, cast to CoreMessage[] for type safety
        return runEngine.execute(
          payload.input,
          payload.messages as CoreMessage[],
          {},
        );
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "RunEngine DO execution failed";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private async withExecutionLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.executionQueue;
    let release: () => void = () => {};
    this.executionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private buildRuntimeDependencies(payload: ExecuteRunPayload): {
    agent: IAgent | undefined;
    runEngineDeps: RunEngineDependencies;
  } {
    const env = this.env as Env;

    const { llmRuntimeService, llmGateway } = this.buildLLMGateway(env);
    const {
      pricingRegistry,
      costLedger,
      costTracker,
      budgetManager,
      pricingResolver,
    } = this.buildPricingAndBudgeting(env);

    const executionService = new ExecutionService(
      env,
      payload.sessionId,
      payload.runId,
    );

    const runtimeExecutionService = {
      execute: (
        plugin: string,
        action: string,
        payloadData: Record<string, unknown>,
      ) => executionService.execute(plugin, action, payloadData),
    };

    const registry = this.buildAgentRegistry(
      llmGateway,
      runtimeExecutionService,
    );
    const resolvedAgentType = this.resolveAgentType(
      payload.input.agentType,
      registry,
    );
    const agent = registry.get(resolvedAgentType);

    const sessionMemoryClient = this.buildSessionMemoryClient(
      env,
      payload.sessionId,
    );

    return {
      agent,
      runEngineDeps: {
        aiService: llmRuntimeService,
        llmGateway,
        costLedger,
        costTracker,
        pricingRegistry,
        pricingResolver,
        budgetManager,
        sessionMemoryClient,
      },
    };
  }

  private buildLLMGateway(env: Env): {
    llmRuntimeService: LLMRuntimeAIService;
    llmGateway: LLMGateway;
  } {
    const aiService = new AIService(env);

    const llmRuntimeService: LLMRuntimeAIService = {
      getProvider: () => aiService.getProvider(),
      getDefaultModel: () => aiService.getDefaultModel(),
      generateText: (input) => aiService.generateText(input),
      generateStructured: (input) => aiService.generateStructured(input),
      createChatStream: (input) => aiService.createChatStream(input),
    };

    const pricingRegistry = new PricingRegistry(undefined, {
      failOnUnseededPricing: env.COST_FAIL_ON_UNSEEDED_PRICING === "true",
    });

    const pricingResolver = new PricingResolver(pricingRegistry, {
      unknownPricingMode: this.getUnknownPricingMode(env),
    });

    const costLedger = new CostLedger(
      this.ctx as unknown as LegacyDurableObjectState,
    );

    const costTracker = new CostTracker(
      this.ctx as unknown as LegacyDurableObjectState,
      pricingRegistry,
      this.getUnknownPricingMode(env),
    );

    const budgetManager = new BudgetManager(
      costTracker,
      pricingRegistry,
      this.getBudgetConfig(env),
      this.ctx as unknown as LegacyDurableObjectState,
    );

    const llmGateway = new LLMGateway({
      aiService: llmRuntimeService,
      budgetPolicy: budgetManager,
      costLedger,
      pricingResolver,
    });

    return { llmRuntimeService, llmGateway };
  }

  private buildPricingAndBudgeting(env: Env): {
    pricingRegistry: PricingRegistry;
    costLedger: CostLedger;
    costTracker: CostTracker;
    budgetManager: BudgetManager;
    pricingResolver: PricingResolver;
  } {
    const pricingRegistry = new PricingRegistry(undefined, {
      failOnUnseededPricing: env.COST_FAIL_ON_UNSEEDED_PRICING === "true",
    });

    const costLedger = new CostLedger(
      this.ctx as unknown as LegacyDurableObjectState,
    );

    const costTracker = new CostTracker(
      this.ctx as unknown as LegacyDurableObjectState,
      pricingRegistry,
      this.getUnknownPricingMode(env),
    );

    const budgetManager = new BudgetManager(
      costTracker,
      pricingRegistry,
      this.getBudgetConfig(env),
      this.ctx as unknown as LegacyDurableObjectState,
    );

    const pricingResolver = new PricingResolver(pricingRegistry, {
      unknownPricingMode: this.getUnknownPricingMode(env),
    });

    return {
      pricingRegistry,
      costLedger,
      costTracker,
      budgetManager,
      pricingResolver,
    };
  }

  private buildAgentRegistry(
    llmGateway: LLMGateway,
    runtimeExecutionService: {
      execute: (
        plugin: string,
        action: string,
        payloadData: Record<string, unknown>,
      ) => Promise<unknown>;
    },
  ): AgentRegistry {
    const registry = new AgentRegistry();
    registry.register(new CodingAgent(llmGateway, runtimeExecutionService));
    registry.register(new ReviewAgent(llmGateway, runtimeExecutionService));
    return registry;
  }

  private buildSessionMemoryClient(
    env: Env,
    sessionId: string,
  ): SessionMemoryClient | undefined {
    if (!env.SESSION_MEMORY_RUNTIME) {
      if (env.NODE_ENV === "production") {
        console.warn(
          "[runtime/RunEngineRuntime] SESSION_MEMORY_RUNTIME binding is not configured. " +
            "Session memory will be disabled. This may cause unexpected behavior.",
        );
      }
      return undefined;
    }

    const sessionMemoryId = env.SESSION_MEMORY_RUNTIME.idFromName(sessionId);
    const sessionMemoryStub = env.SESSION_MEMORY_RUNTIME.get(sessionMemoryId);
    return new SessionMemoryClient({
      durableObjectId: sessionId,
      durableObjectStub: sessionMemoryStub as unknown as {
        fetch: (request: Request) => Promise<Response>;
      },
    });
  }

  private getUnknownPricingMode(env: Env): "warn" | "block" {
    const mode = env.COST_UNKNOWN_PRICING_MODE;
    if (mode === "block" || mode === "warn") {
      return mode;
    }
    return "warn";
  }

  private getBudgetConfig(env: Env): {
    maxCostPerRun?: number;
    maxCostPerSession?: number;
  } {
    const parseBudget = (value: string | undefined): number | undefined => {
      if (!value) return undefined;
      const parsed = parseFloat(value);
      if (Number.isNaN(parsed)) {
        console.warn(
          `[runtime/RunEngineRuntime] Invalid budget value: ${value}`,
        );
        return undefined;
      }
      return parsed;
    };

    return {
      maxCostPerRun: parseBudget(env.MAX_RUN_BUDGET),
      maxCostPerSession: parseBudget(env.MAX_SESSION_BUDGET),
    };
  }

  private resolveAgentType(
    requestedType: AgentType,
    registry: AgentRegistry,
  ): AgentType {
    if (registry.has(requestedType)) {
      return requestedType;
    }

    const fallbackType: AgentType = "coding";
    console.warn(
      `[run-engine/runtime] Unsupported agent type "${requestedType}". Falling back to "${fallbackType}".`,
    );
    return fallbackType;
  }
}
