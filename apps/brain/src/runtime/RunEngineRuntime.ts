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

const ExecuteRunPayloadSchema = z.object({
  runId: z.string().min(1),
  sessionId: z.string().min(1),
  correlationId: z.string().min(1),
  requestOrigin: z.string().optional(),
  input: z.object({
    agentType: z.enum(["coding", "review", "ci"]),
    prompt: z.string().min(1),
    sessionId: z.string().min(1),
  }),
  messages: z.array(z.unknown()),
});

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

    const llmGateway = new LLMGateway({
      aiService: llmRuntimeService,
      budgetPolicy: budgetManager,
      costLedger,
      pricingResolver,
    });

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

    const registry = new AgentRegistry();
    registry.register(new CodingAgent(llmGateway, runtimeExecutionService));
    registry.register(new ReviewAgent(llmGateway, runtimeExecutionService));

    const resolvedAgentType = this.resolveAgentType(
      payload.input.agentType,
      registry,
    );
    const agent = registry.get(resolvedAgentType);

    let sessionMemoryClient;
    if (env.SESSION_MEMORY_RUNTIME) {
      const sessionMemoryId = env.SESSION_MEMORY_RUNTIME.idFromName(
        payload.sessionId,
      );
      const sessionMemoryStub = env.SESSION_MEMORY_RUNTIME.get(sessionMemoryId);
      sessionMemoryClient = new SessionMemoryClient({
        durableObjectId: payload.sessionId,
        durableObjectStub: sessionMemoryStub as unknown as {
          fetch: (request: Request) => Promise<Response>;
        },
      });
    }

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
    return {
      maxCostPerRun: env.MAX_RUN_BUDGET
        ? parseFloat(env.MAX_RUN_BUDGET)
        : undefined,
      maxCostPerSession: env.MAX_SESSION_BUDGET
        ? parseFloat(env.MAX_SESSION_BUDGET)
        : undefined,
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
