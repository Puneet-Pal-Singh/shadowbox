import type { DurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage, CoreTool } from "ai";
import { Run, RunRepository } from "../run";
import { Task, TaskRepository } from "../task";
import {
  BudgetManager,
  BudgetExceededError,
  CostLedger,
  CostTracker,
  PricingRegistry,
  PricingResolver,
  SessionBudgetExceededError,
  type BudgetPolicy,
  type IBudgetManager,
  type ICostLedger,
  type ICostTracker,
  type IPricingRegistry,
  type IPricingResolver,
  type CostSnapshot,
} from "../cost";
import { PlannerService } from "../planner";
import { TaskScheduler } from "../orchestration";
import { DefaultTaskExecutor, AgentTaskExecutor } from "./TaskExecutor";
import { AIService } from "../../services/AIService";
import type { Env } from "../../types/ai";
import type { RunInput, RunStatus, IAgent } from "../../types";
import type { Plan, PlannedTask } from "../planner";
import { CORS_HEADERS } from "../../lib/cors";
import { LLMGateway, type ILLMGateway } from "../llm";

export interface IRunEngine {
  execute(
    input: RunInput,
    messages: CoreMessage[],
    tools: Record<string, CoreTool>,
  ): Promise<Response>;
  getRunStatus(runId: string): Promise<RunStatus | null>;
  cancel(runId: string): Promise<boolean>;
}

export interface RunEngineOptions {
  env: Env;
  sessionId: string;
  runId: string;
  correlationId: string;
  requestOrigin?: string;
}

export interface RunEngineDependencies {
  aiService?: AIService;
  llmGateway?: ILLMGateway;
  costLedger?: ICostLedger;
  costTracker?: ICostTracker;
  pricingRegistry?: IPricingRegistry;
  pricingResolver?: IPricingResolver;
  budgetManager?: IBudgetManager & BudgetPolicy;
  planner?: PlannerService;
  scheduler?: TaskScheduler;
}

export class RunEngine implements IRunEngine {
  private runRepo: RunRepository;
  private taskRepo: TaskRepository;
  private pricingRegistry: IPricingRegistry;
  private costLedger: ICostLedger;
  private costTracker: ICostTracker;
  private budgetManager: IBudgetManager & BudgetPolicy;
  private planner: PlannerService;
  private scheduler: TaskScheduler;
  private aiService?: AIService;
  private llmGateway: ILLMGateway;
  private agent?: IAgent;
  private readonly sessionCostsLoaded: Promise<void>;

  constructor(
    ctx: DurableObjectState,
    private options: RunEngineOptions,
    agent?: IAgent,
    pricingRegistry?: IPricingRegistry,
    dependencies: RunEngineDependencies = {},
  ) {
    this.runRepo = new RunRepository(ctx);
    this.taskRepo = new TaskRepository(ctx);

    this.pricingRegistry =
      dependencies.pricingRegistry ??
      pricingRegistry ??
      new PricingRegistry(undefined, {
        failOnUnseededPricing:
          options.env.COST_FAIL_ON_UNSEEDED_PRICING === "true",
      });
    this.costLedger = dependencies.costLedger ?? new CostLedger(ctx);
    this.costTracker =
      dependencies.costTracker ??
      new CostTracker(
        ctx,
        this.pricingRegistry,
        this.getUnknownPricingMode(options.env),
      );

    this.budgetManager =
      dependencies.budgetManager ??
      new BudgetManager(
        this.costTracker,
        this.pricingRegistry,
        this.getBudgetConfig(options.env),
        ctx,
      );
    this.sessionCostsLoaded = this.budgetManager.loadSessionCosts();

    if (dependencies.aiService) {
      this.aiService = dependencies.aiService;
    } else if (!dependencies.llmGateway) {
      this.aiService = new AIService(options.env);
    }

    const pricingResolver =
      dependencies.pricingResolver ??
      new PricingResolver(this.pricingRegistry, {
        unknownPricingMode: this.getUnknownPricingMode(options.env),
      });

    if (dependencies.llmGateway) {
      this.llmGateway = dependencies.llmGateway;
    } else {
      if (!this.aiService) {
        throw new RunEngineError("AIService is required when llmGateway is not injected");
      }
      this.llmGateway = new LLMGateway({
        aiService: this.aiService,
        budgetPolicy: this.budgetManager,
        costLedger: this.costLedger,
        pricingResolver,
      });
    }

    this.planner = dependencies.planner ?? new PlannerService(this.llmGateway);
    this.agent = agent;

    const taskExecutor = agent
      ? new AgentTaskExecutor(agent, options.runId, options.sessionId, this.taskRepo)
      : new DefaultTaskExecutor();
    this.scheduler =
      dependencies.scheduler ?? new TaskScheduler(this.taskRepo, taskExecutor);
  }

  async execute(
    input: RunInput,
    _messages: CoreMessage[],
    _tools: Record<string, CoreTool>,
  ): Promise<Response> {
    const { runId, sessionId } = this.options;

    try {
      await this.sessionCostsLoaded;
      const run = await this.getOrCreateRun(input, runId, sessionId);

      console.log(`[run/engine] Planning phase for run ${runId}`);
      try {
        run.transition("PLANNING");
        await this.runRepo.update(run);

        const plan = await this.generatePlan(run, input.prompt);
        await this.createTasksFromPlan(run.id, plan);
      } catch (planError) {
        run.transition("FAILED");
        run.metadata.error =
          planError instanceof Error ? planError.message : "Planning phase failed";
        await this.runRepo.update(run);
        throw planError;
      }

      console.log(`[run/engine] Execution phase for run ${runId}`);
      run.transition("RUNNING");
      await this.runRepo.update(run);

      await this.scheduler.execute(run.id, {
        beforeTask: async (task) => {
          console.log(
            `[task/scheduler] beforeTask run=${run.id} task=${task.id} phase=task`,
          );
        },
        afterTask: async (task, result) => {
          console.log(
            `[task/scheduler] afterTask run=${run.id} task=${task.id} status=${result.status}`,
          );
        },
        onTaskError: async (task, error) => {
          console.error(`[task/scheduler] onTaskError task=${task.id}`, error);
        },
      });

      console.log(`[run/engine] Synthesis phase for run ${runId}`);
      const finalOutput = await this.generateSynthesis(run, input.prompt);

      run.transition("COMPLETED");
      run.output = { content: finalOutput };
      await this.runRepo.update(run);

      console.log(`[run/engine] Completed run ${runId}`);
      return this.createStreamResponse(finalOutput);
    } catch (error) {
      await this.handleExecutionError(runId, error);
      throw error;
    }
  }

  async getRunStatus(runId: string): Promise<RunStatus | null> {
    const run = await this.runRepo.getById(runId);
    return run?.status ?? null;
  }

  async cancel(runId: string): Promise<boolean> {
    const run = await this.runRepo.getById(runId);
    if (
      !run ||
      run.status === "COMPLETED" ||
      run.status === "FAILED" ||
      run.status === "CANCELLED"
    ) {
      return false;
    }

    run.transition("CANCELLED");
    await this.runRepo.update(run);

    const tasks = await this.taskRepo.getByRun(runId);
    for (const task of tasks) {
      if (["PENDING", "READY", "RUNNING"].includes(task.status)) {
        task.transition("CANCELLED");
        await this.taskRepo.update(task);
      }
    }

    console.log(`[run/engine] Cancelled run ${runId}`);
    return true;
  }

  private async getOrCreateRun(
    input: RunInput,
    runId: string,
    sessionId: string,
  ): Promise<Run> {
    const existing = await this.runRepo.getById(runId);
    if (existing) {
      return existing;
    }

    const run = new Run(
      runId,
      sessionId,
      "CREATED",
      input.agentType,
      input,
      undefined,
      { prompt: input.prompt },
    );

    await this.runRepo.create(run);
    console.log(`[run/engine] Created new run ${runId}`);

    return run;
  }

  private async createTasksFromPlan(runId: string, plan: Plan): Promise<void> {
    for (const plannedTask of plan.tasks) {
      const task = this.createTaskFromPlanned(runId, plannedTask);
      await this.taskRepo.create(task);
    }

    console.log(
      `[run/engine] Created ${plan.tasks.length} tasks for run ${runId}`,
    );
  }

  private createTaskFromPlanned(runId: string, planned: PlannedTask): Task {
    return new Task(
      planned.id,
      runId,
      planned.type,
      "PENDING",
      planned.dependsOn,
      {
        description: planned.description,
        expectedOutput: planned.expectedOutput,
      },
    );
  }

  private async generatePlan(run: Run, prompt: string): Promise<Plan> {
    if (this.agent) {
      return this.agent.plan({ run, prompt, history: undefined });
    }
    return this.planner.plan(run, prompt);
  }

  private async generateSynthesis(run: Run, originalPrompt: string): Promise<string> {
    if (this.agent) {
      const tasks = await this.taskRepo.getByRun(run.id);
      const completedTasks = tasks
        .filter((task) => task.status === "DONE")
        .map((task) => task.toJSON());
      return this.agent.synthesize({
        runId: run.id,
        sessionId: run.sessionId,
        completedTasks,
        originalPrompt,
      });
    }
    return this.synthesizeResult(run, originalPrompt);
  }

  private async synthesizeResult(run: Run, originalPrompt: string): Promise<string> {
    const tasks = await this.taskRepo.getByRun(run.id);
    const completedTasks = tasks.filter((task) => task.status === "DONE");

    const taskResults = completedTasks
      .map(
        (task) =>
          `- ${task.type}: ${task.input.description}\n  Result: ${task.output?.content || "N/A"}`,
      )
      .join("\n");

    const synthesisPrompt = `Based on the following completed tasks, provide a final summary:

Original Request: ${originalPrompt}

Completed Tasks:
${taskResults}

Provide a concise summary of what was accomplished.`;

    try {
      const result = await this.llmGateway.generateText({
        context: {
          runId: run.id,
          sessionId: run.sessionId,
          agentType: run.agentType,
          phase: "synthesis",
        },
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant summarizing task results.",
          },
          {
            role: "user",
            content: synthesisPrompt,
          },
        ],
        temperature: 0.7,
      });

      return result.text;
    } catch (error) {
      if (
        error instanceof BudgetExceededError ||
        error instanceof SessionBudgetExceededError
      ) {
        console.error(`[run/engine] Budget exceeded for run ${run.id}`);
        return `## Summary\n\nBudget limit reached for this run.\n\nCompleted ${completedTasks.length} tasks for your request.\n\n${taskResults}`;
      }
      console.error("[run/engine] Synthesis failed:", error);
      return `## Summary\n\nCompleted ${completedTasks.length} tasks for your request.\n\n${taskResults}`;
    }
  }

  private createStreamResponse(content: string): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  }

  private async handleExecutionError(runId: string, error: unknown): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown execution error";

    try {
      const run = await this.runRepo.getById(runId);
      if (run) {
        run.transition("FAILED");
        run.metadata.error = errorMessage;
        await this.runRepo.update(run);
      }
    } catch (handlerError) {
      console.error(
        `[run/engine] Failed to handle execution error for run ${runId}:`,
        handlerError,
      );
    }

    console.error(`[run/engine] Run ${runId} failed:`, errorMessage);
  }

  async getCostSnapshot(runId: string): Promise<CostSnapshot> {
    return this.costLedger.aggregate(runId);
  }

  async getTasksForRun(runId: string) {
    return this.taskRepo.getByRun(runId);
  }

  async getRun(runId: string) {
    return this.runRepo.getById(runId);
  }

  private getUnknownPricingMode(env: Env): "warn" | "block" {
    const configuredMode = env.COST_UNKNOWN_PRICING_MODE as unknown;
    if (typeof configuredMode === "string") {
      const normalized = configuredMode.trim().toLowerCase();
      if (normalized === "warn" || normalized === "block") {
        return normalized;
      }
      console.warn(
        `[run/engine] Invalid COST_UNKNOWN_PRICING_MODE=${configuredMode}. Falling back to NODE_ENV default.`,
      );
    }
    const nodeEnv =
      typeof process !== "undefined" ? process.env?.NODE_ENV : undefined;
    return nodeEnv === "production" ? "block" : "warn";
  }

  private getBudgetConfig(env: Env): {
    maxCostPerRun?: number;
    maxCostPerSession?: number;
  } {
    return {
      maxCostPerRun: parseOptionalNumber(env.MAX_RUN_BUDGET),
      maxCostPerSession: parseOptionalNumber(env.MAX_SESSION_BUDGET),
    };
  }
}

function parseOptionalNumber(value?: string): number | undefined {
  if (!value || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class RunEngineError extends Error {
  constructor(message: string) {
    super(`[run/engine] ${message}`);
    this.name = "RunEngineError";
  }
}
