import type { CoreMessage, CoreTool } from "ai";
import { Run, RunRepository } from "../run/index.js";
import { Task, TaskRepository } from "../task/index.js";
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
} from "../cost/index.js";
import { PlannerService } from "../planner/index.js";
import { TaskScheduler } from "../orchestration/index.js";
import { DefaultTaskExecutor, AgentTaskExecutor } from "./TaskExecutor.js";
import type {
  RunInput,
  RunStatus,
  IAgent,
  RuntimeDurableObjectState,
} from "../types.js";
import type { Plan, PlannedTask } from "../planner/index.js";
import {
  LLMGateway,
  type ILLMGateway,
  type LLMRuntimeAIService,
} from "../llm/index.js";
import {
  MemoryCoordinator,
  MemoryRepository,
  type MemoryCoordinatorDependencies,
  type MemoryContext,
} from "../memory/index.js";

const RUNTIME_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-vercel-ai-data-stream, x-ai-sdk-data-stream",
  "Access-Control-Expose-Headers":
    "x-vercel-ai-data-stream, x-ai-sdk-data-stream",
  "X-Content-Type-Options": "nosniff",
};

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
  env: RunEngineEnv;
  sessionId: string;
  runId: string;
  correlationId: string;
  requestOrigin?: string;
}

export interface RunEngineEnv {
  COST_FAIL_ON_UNSEEDED_PRICING?: string;
  COST_UNKNOWN_PRICING_MODE?: string;
  MAX_RUN_BUDGET?: string;
  MAX_SESSION_BUDGET?: string;
}

export interface RunEngineDependencies {
  aiService?: LLMRuntimeAIService;
  llmGateway?: ILLMGateway;
  costLedger?: ICostLedger;
  costTracker?: ICostTracker;
  pricingRegistry?: IPricingRegistry;
  pricingResolver?: IPricingResolver;
  budgetManager?: IBudgetManager & BudgetPolicy;
  planner?: PlannerService;
  scheduler?: TaskScheduler;
  memoryCoordinator?: MemoryCoordinator;
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
  private aiService?: LLMRuntimeAIService;
  private llmGateway: ILLMGateway;
  private agent?: IAgent;
  private memoryCoordinator: MemoryCoordinator;
  private currentMemoryContext?: MemoryContext;
  private readonly sessionCostsLoaded: Promise<void>;

  constructor(
    ctx: RuntimeDurableObjectState,
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

    this.aiService = dependencies.aiService;

    const pricingResolver =
      dependencies.pricingResolver ??
      new PricingResolver(this.pricingRegistry, {
        unknownPricingMode: this.getUnknownPricingMode(options.env),
      });

    if (dependencies.llmGateway) {
      this.llmGateway = dependencies.llmGateway;
    } else {
      if (!this.aiService) {
        throw new RunEngineError(
          "LLMRuntimeAIService is required when llmGateway is not injected",
        );
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
      ? new AgentTaskExecutor(
          agent,
          options.runId,
          options.sessionId,
          this.taskRepo,
        )
      : new DefaultTaskExecutor();
    this.scheduler =
      dependencies.scheduler ?? new TaskScheduler(this.taskRepo, taskExecutor);

    if (dependencies.memoryCoordinator) {
      this.memoryCoordinator = dependencies.memoryCoordinator;
    } else {
      const memoryRepo = new MemoryRepository({ ctx });
      this.memoryCoordinator = new MemoryCoordinator({
        repository: memoryRepo,
      });
    }
  }

  async execute(
    input: RunInput,
    messages: CoreMessage[],
    _tools: Record<string, CoreTool>,
  ): Promise<Response> {
    const { runId, sessionId } = this.options;

    try {
      await this.sessionCostsLoaded;
      const run = await this.getOrCreateRun(input, runId, sessionId);

      console.log(`[run/engine] Retrieving memory context for run ${runId}`);
      this.currentMemoryContext = await this.safeMemoryOperation(
        () =>
          this.memoryCoordinator.retrieveContext({
            runId,
            sessionId,
            prompt: input.prompt,
            phase: "planning",
          }),
        undefined,
      );

      await this.safeMemoryOperation(() =>
        this.persistConversationMessages(runId, sessionId, messages, "user"),
      );

      console.log(`[run/engine] Planning phase for run ${runId}`);
      try {
        run.transition("PLANNING");
        await this.runRepo.update(run);

        const plan = await this.generatePlan(
          run,
          input.prompt,
          this.currentMemoryContext,
        );
        await this.createTasksFromPlan(run.id, plan);

        await this.safeMemoryOperation(() =>
          this.memoryCoordinator.createCheckpoint({
            runId,
            sequence: 1,
            phase: "planning",
            runStatus: run.status,
            taskStatuses: {},
          }),
        );
      } catch (planError) {
        run.transition("FAILED");
        run.metadata.error =
          planError instanceof Error
            ? planError.message
            : "Planning phase failed";
        await this.runRepo.update(run);
        throw planError;
      }

      console.log(`[run/engine] Execution phase for run ${runId}`);
      run.transition("RUNNING");
      await this.runRepo.update(run);

      const taskResults: Array<{ taskId: string; content: string }> = [];

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
          if (result.output?.content) {
            taskResults.push({
              taskId: task.id,
              content: result.output.content,
            });
          }
        },
        onTaskError: async (task, error) => {
          console.error(`[task/scheduler] onTaskError task=${task.id}`, error);
        },
      });

      for (const { taskId, content } of taskResults) {
        await this.safeMemoryOperation(() =>
          this.memoryCoordinator.extractAndPersist({
            runId,
            sessionId,
            taskId,
            source: "task",
            content,
            phase: "execution",
          }),
        );
      }

      const allTasks = await this.taskRepo.getByRun(runId);
      await this.safeMemoryOperation(() =>
        this.memoryCoordinator.createCheckpoint({
          runId,
          sequence: 2,
          phase: "execution",
          runStatus: run.status,
          taskStatuses: Object.fromEntries(
            allTasks.map((t) => [t.id, t.status]),
          ),
        }),
      );

      console.log(`[run/engine] Synthesis phase for run ${runId}`);
      const finalOutput = await this.generateSynthesis(
        run,
        input.prompt,
        this.currentMemoryContext,
      );

      await this.safeMemoryOperation(() =>
        this.memoryCoordinator.extractAndPersist({
          runId,
          sessionId,
          source: "synthesis",
          content: finalOutput,
          phase: "synthesis",
        }),
      );

      await this.safeMemoryOperation(() =>
        this.memoryCoordinator.createCheckpoint({
          runId,
          sequence: 3,
          phase: "synthesis",
          runStatus: "COMPLETED",
          taskStatuses: {},
        }),
      );

      await this.safeMemoryOperation(() =>
        this.persistConversationMessages(
          runId,
          sessionId,
          [{ role: "assistant", content: finalOutput }],
          "assistant",
        ),
      );

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

  private async persistConversationMessages(
    runId: string,
    sessionId: string,
    messages: CoreMessage[],
    role: "user" | "assistant",
  ): Promise<void> {
    for (const message of messages) {
      if (typeof message.content === "string" && message.content.trim()) {
        await this.memoryCoordinator.extractAndPersist({
          runId,
          sessionId,
          source: role,
          content: message.content,
          phase: role === "user" ? "planning" : "synthesis",
        });
      }
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
      if (existing.sessionId !== sessionId) {
        throw new RunEngineError(
          `runId ${runId} is already associated with a different session`,
        );
      }

      if (this.isTerminalRun(existing.status)) {
        await this.taskRepo.deleteByRun(runId);
        const resetRun = this.createFreshRun(runId, sessionId, input);
        await this.runRepo.update(resetRun);
        console.log(
          `[run/engine] Reset terminal run ${runId} (${existing.status}) for next turn`,
        );
        return resetRun;
      }

      return existing;
    }

    const run = this.createFreshRun(runId, sessionId, input);

    await this.runRepo.create(run);
    console.log(`[run/engine] Created new run ${runId}`);

    return run;
  }

  private createFreshRun(
    runId: string,
    sessionId: string,
    input: RunInput,
  ): Run {
    return new Run(
      runId,
      sessionId,
      "CREATED",
      input.agentType,
      input,
      undefined,
      { prompt: input.prompt },
    );
  }

  private isTerminalRun(status: RunStatus): boolean {
    return (
      status === "COMPLETED" || status === "FAILED" || status === "CANCELLED"
    );
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

  private async generatePlan(
    run: Run,
    prompt: string,
    memoryContext?: MemoryContext,
  ): Promise<Plan> {
    if (this.agent) {
      return this.agent.plan({ run, prompt, history: undefined });
    }
    return this.planner.plan(run, prompt, memoryContext);
  }

  private async generateSynthesis(
    run: Run,
    originalPrompt: string,
    memoryContext?: MemoryContext,
  ): Promise<string> {
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
    return this.synthesizeResult(run, originalPrompt, memoryContext);
  }

  private async synthesizeResult(
    run: Run,
    originalPrompt: string,
    memoryContext?: MemoryContext,
  ): Promise<string> {
    const tasks = await this.taskRepo.getByRun(run.id);
    const completedTasks = tasks.filter((task) => task.status === "DONE");

    const taskResults = completedTasks
      .map(
        (task) =>
          `- ${task.type}: ${task.input.description}\n  Result: ${task.output?.content || "N/A"}`,
      )
      .join("\n");

    const memorySection = memoryContext
      ? this.memoryCoordinator.formatContextForPrompt(memoryContext)
      : "";

    const synthesisPrompt = `Based on the following completed tasks, provide a final summary:

Original Request: ${originalPrompt}

${memorySection ? `Memory Context:\n${memorySection}\n\n` : ""}Completed Tasks:
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
        ...RUNTIME_CORS_HEADERS,
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  }

  private async handleExecutionError(
    runId: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown execution error";

    try {
      const run = await this.runRepo.getById(runId);
      if (run) {
        if (run.status !== "FAILED" && run.status !== "CANCELLED") {
          if (run.status === "COMPLETED") {
            console.warn(
              `[run/engine] Preserving COMPLETED state for run ${runId} after post-completion error`,
            );
          } else {
            run.transition("FAILED");
          }
        }
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

  private async safeMemoryOperation<T>(
    operation: () => Promise<T>,
    fallback?: T,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.warn("[run/engine] Memory subsystem operation failed:", error);
      return fallback as T;
    }
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

  private getUnknownPricingMode(env: RunEngineEnv): "warn" | "block" {
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

  private getBudgetConfig(env: RunEngineEnv): {
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
