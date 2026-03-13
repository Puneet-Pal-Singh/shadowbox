import type { CoreMessage, CoreTool } from "ai";
import { Run, RunRepository, RunStateMachine } from "../run/index.js";
import { Task, TaskRepository } from "../task/index.js";
import {
  BudgetManager,
  CostLedger,
  CostTracker,
  PricingRegistry,
  PricingResolver,
  type BudgetPolicy,
  type IBudgetManager,
  type ICostLedger,
  type ICostTracker,
  type IPricingRegistry,
  type IPricingResolver,
  type CostSnapshot,
} from "../cost/index.js";
import { PlannerService } from "../planner/index.js";
import { TaskScheduler, type TaskExecutor } from "../orchestration/index.js";
import { DefaultTaskExecutor, AgentTaskExecutor } from "./TaskExecutor.js";
import { AgenticLoop } from "./AgenticLoop.js";
import type {
  RunInput,
  RunStatus,
  IAgent,
  RepositoryContext,
  RuntimeDurableObjectState,
  WorkspaceBootstrapper,
} from "../types.js";
import type { Plan } from "../planner/index.js";
import {
  LLMGateway,
  LLMTimeoutError,
  type ILLMGateway,
  type LLMRuntimeAIService,
} from "../llm/index.js";
import {
  MemoryCoordinator,
  MemoryRepository,
  type MemoryCoordinatorDependencies,
  type MemoryContext,
} from "../memory/index.js";
import { PermissionApprovalStore } from "./PermissionApprovalStore.js";
import {
  getPermissionPolicyMessage,
  getWorkspaceBootstrapMessage,
  processPermissionDirectives as processPermissionDirectivesPolicy,
} from "./RunPermissionWorkspacePolicy.js";
import { createRunManifest, ensureManifestMatch } from "./RunManifestPolicy.js";
import { buildConversationalSystemPrompt } from "./ConversationPolicy.js";
import { sanitizeUserFacingOutput } from "./RunOutputSanitizer.js";
import {
  applyFinalRunStatus,
  determineRunStatusFromTasks,
  transitionRunToCompleted,
  transitionRunToFailed,
} from "./RunStatusPolicy.js";
import {
  buildAgenticLoopFinalOutput,
  getAgenticLoopMaxSteps,
  recordAgenticLoopMetadata,
  resolveAgenticLoopTools,
} from "./RunAgenticLoopPolicy.js";
import {
  isPlatformApprovalOwner,
  recordLifecycleStep,
  recordOrchestrationActivation,
  recordOrchestrationTerminal,
  recordPhaseSelectionSnapshot,
  recordTurnModeDecision,
} from "./RunMetadataPolicy.js";
import { resetRecyclableRun } from "./RunRecyclableResetPolicy.js";
import { applyReviewerPassIfEnabled } from "./RunReviewerPassPolicy.js";
import {
  determineTurnMode as determineTurnModePolicy,
  type TurnModeDecision,
  type TurnMode,
} from "./RunTurnModePolicy.js";
import { buildPlanningRecoveryMessage } from "./RunPlanningRecoveryPolicy.js";
import { synthesizeResultFromTasks } from "./RunSynthesisPolicy.js";
import {
  buildDirectExecutionPlan,
  type ExecutablePlan,
  type ExecutablePlannedTask,
} from "./RunDirectPlanPolicy.js";

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
  NODE_ENV?: string;
  ALLOW_DEFAULT_EXECUTOR?: string;
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
  sessionMemoryClient?: MemoryCoordinatorDependencies["sessionMemoryClient"];
  workspaceBootstrapper?: WorkspaceBootstrapper;
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
  private taskExecutor: TaskExecutor;
  private aiService?: LLMRuntimeAIService;
  private llmGateway: ILLMGateway;
  private agent?: IAgent;
  private memoryCoordinator: MemoryCoordinator;
  private currentMemoryContext?: MemoryContext;
  private readonly sessionCostsLoaded: Promise<void>;
  private workspaceBootstrapper?: WorkspaceBootstrapper;
  private permissionApprovalStore: PermissionApprovalStore;

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

    // Allow test mode to use DefaultTaskExecutor for isolated testing
    const isTestMode =
      options.env?.NODE_ENV === "test" ||
      options.env?.ALLOW_DEFAULT_EXECUTOR === "true";

    if (!agent && !isTestMode) {
      throw new RunEngineError(
        "Agent is required for production runtime execution. " +
          "Set NODE_ENV=test or ALLOW_DEFAULT_EXECUTOR=true to enable DefaultTaskExecutor for testing.",
      );
    }

    // Use AgentTaskExecutor when agent is provided, otherwise use DefaultTaskExecutor in test mode
    this.taskExecutor = agent
      ? new AgentTaskExecutor(
          agent,
          options.runId,
          options.sessionId,
          this.taskRepo,
          this.runRepo,
        )
      : new DefaultTaskExecutor();
    this.scheduler =
      dependencies.scheduler ??
      new TaskScheduler(this.taskRepo, this.taskExecutor);

    if (dependencies.memoryCoordinator) {
      this.memoryCoordinator = dependencies.memoryCoordinator;
    } else {
      const memoryRepo = new MemoryRepository({ ctx });
      this.memoryCoordinator = new MemoryCoordinator({
        repository: memoryRepo,
        sessionMemoryClient: dependencies.sessionMemoryClient,
      });
    }

    this.workspaceBootstrapper = dependencies.workspaceBootstrapper;
    this.permissionApprovalStore = new PermissionApprovalStore(
      ctx,
      options.runId,
    );
  }

  async execute(
    input: RunInput,
    messages: CoreMessage[],
    tools: Record<string, CoreTool>,
  ): Promise<Response> {
    const { runId, sessionId } = this.options;
    const runStartedAt = Date.now();
    try {
      await this.sessionCostsLoaded;
      const run = await this.getOrCreateRun(input, runId, sessionId);
      recordOrchestrationActivation(run);
      await this.runRepo.update(run);
      console.log(`[run/engine] Retrieving memory context for run ${runId}`);
      this.currentMemoryContext = await this.safeMemoryOperation(() =>
        this.memoryCoordinator.retrieveContext({
          runId,
          sessionId,
          prompt: input.prompt,
          phase: "planning",
        }),
      );
      await this.safeMemoryOperation(() =>
        this.persistConversationMessages(runId, sessionId, messages, "user"),
      );
      recordLifecycleStep(run, "CONTEXT_PREPARED");

      if (isPlatformApprovalOwner(run.metadata.manifest)) {
        const approvalDirectiveMessage = await this.processPermissionDirectives(
          input.prompt,
        );
        if (approvalDirectiveMessage) {
          recordLifecycleStep(
            run,
            "APPROVAL_WAIT",
            "approval directive processed",
          );
          console.log(
            `[run/engine] Permission directive processed for run ${runId}`,
          );
          return await this.completeRunWithAssistantMessage(
            run,
            approvalDirectiveMessage,
          );
        }
      } else {
        console.log(
          `[run/engine] Delegated harness mode active; skipping platform approval directives for run ${runId}`,
        );
      }

      let turnMode: TurnMode;
      try {
        const turnDecision = await determineTurnModePolicy({
          llmGateway: this.llmGateway,
          run,
          prompt: input.prompt,
          messages,
          repositoryContext: input.repositoryContext,
        });
        turnMode = turnDecision.mode;
        recordTurnModeDecision(run, turnDecision);
        await this.runRepo.update(run);
        console.log(
          `[run/engine] Turn mode selected for run ${runId}: mode=${turnDecision.mode} source=${turnDecision.source}`,
        );
      } catch (turnModeError) {
        recordTurnModeDecision(
          run,
          buildRecoveredTurnModeDecision(turnModeError),
        );
        await this.runRepo.update(run);
        console.warn(
          `[run/engine] Turn mode classification failed for run ${runId}; source=recovered`,
          turnModeError,
        );
        const recoveryResponse = await this.tryHandlePlanningError(
          run,
          runId,
          turnModeError,
        );
        if (recoveryResponse) {
          return recoveryResponse;
        }
        throw turnModeError;
      }
      if (turnMode === "chat") {
        console.log(
          `[run/engine] Model-selected conversational mode for run ${runId}`,
        );
        const response = await this.executeConversationalTurn(
          run,
          input,
          messages,
        );
        console.log(
          `[run/timing] run=${runId} step=total elapsedMs=${Date.now() - runStartedAt} status=${run.status} mode=chat`,
        );
        return response;
      }

      if (isPlatformApprovalOwner(run.metadata.manifest)) {
        const permissionMessage = await getPermissionPolicyMessage(
          input.prompt,
          input.repositoryContext,
          this.permissionApprovalStore,
        );
        if (permissionMessage) {
          recordLifecycleStep(
            run,
            "APPROVAL_WAIT",
            "platform approval required",
          );
          console.log(
            `[run/engine] Permission check blocked action planning for run ${runId}`,
          );
          return await this.completeRunWithAssistantMessage(
            run,
            permissionMessage,
          );
        }
      } else {
        console.log(
          `[run/engine] Delegated harness mode active; skipping platform approval gates for run ${runId}`,
        );
      }

      const bootstrapMessage = await getWorkspaceBootstrapMessage(
        run.id,
        input.repositoryContext,
        this.workspaceBootstrapper,
      );
      if (bootstrapMessage) {
        console.log(
          `[run/engine] Workspace bootstrap blocked action planning for run ${runId}`,
        );
        return await this.completeRunWithAssistantMessage(
          run,
          bootstrapMessage,
        );
      }

      const agenticLoopTools = resolveAgenticLoopTools(
        run.input.metadata,
        tools,
      );
      if (agenticLoopTools) {
        return await this.executeAgenticLoopPath(
          run,
          input,
          messages,
          agenticLoopTools,
        );
      }

      console.log(`[run/engine] Planning phase for run ${runId}`);
      try {
        run.transition("PLANNING");
        recordPhaseSelectionSnapshot(run, "planning");
        await this.runRepo.update(run);

        const plan = await this.generatePlan(
          run,
          input.prompt,
          this.currentMemoryContext,
        );
        await this.createTasksFromPlan(run.id, plan);
        recordLifecycleStep(
          run,
          "PLAN_VALIDATED",
          plan.metadata.reasoning ?? undefined,
        );

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
        const recoveryResponse = await this.tryHandlePlanningError(
          run,
          runId,
          planError,
        );
        if (recoveryResponse) {
          return recoveryResponse;
        }
        transitionRunToFailed(run, runId);
        run.metadata.error =
          planError instanceof Error
            ? planError.message
            : "Planning phase failed";
        await this.runRepo.update(run);
        throw planError;
      }

      console.log(`[run/engine] Execution phase for run ${runId}`);
      run.transition("RUNNING");
      recordPhaseSelectionSnapshot(run, "execution");
      recordLifecycleStep(run, "TASK_EXECUTING");
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
      const finalRunStatus = determineRunStatusFromTasks(allTasks);
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
      recordPhaseSelectionSnapshot(run, "synthesis");
      recordLifecycleStep(run, "SYNTHESIS");
      const finalOutputRaw = await this.generateSynthesis(
        run,
        input.prompt,
        this.currentMemoryContext,
      );
      const finalOutput = await applyReviewerPassIfEnabled({
        run,
        originalPrompt: input.prompt,
        synthesisOutput: sanitizeUserFacingOutput(finalOutputRaw),
        llmGateway: this.llmGateway,
      });

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
          runStatus: finalRunStatus,
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
      applyFinalRunStatus(run, runId, finalRunStatus, allTasks);
      recordLifecycleStep(run, "TERMINAL", `status=${finalRunStatus}`);
      recordOrchestrationTerminal(run);
      run.output = { content: finalOutput };
      await this.runRepo.update(run);
      console.log(`[run/engine] Completed run ${runId}`);
      console.log(
        `[run/timing] run=${runId} step=total elapsedMs=${Date.now() - runStartedAt} status=${finalRunStatus} mode=task`,
      );
      return this.createStreamResponse(finalOutput);
    } catch (error) {
      await this.handleExecutionError(runId, error);
      throw error;
    }
  }

  private async executeAgenticLoopPath(
    run: Run,
    input: RunInput,
    messages: CoreMessage[],
    tools: Record<string, CoreTool>,
  ): Promise<Response> {
    console.log(`[run/engine] Agentic loop execution active for run ${run.id}`);
    run.transition("RUNNING");
    recordPhaseSelectionSnapshot(run, "execution");
    recordLifecycleStep(run, "TASK_EXECUTING", "agentic_loop");
    await this.runRepo.update(run);

    const loop = new AgenticLoop(
      {
        maxSteps: getAgenticLoopMaxSteps(run.input.metadata),
        runId: run.id,
        sessionId: run.sessionId,
        budget: this.budgetManager,
      },
      this.llmGateway,
      this.taskExecutor,
    );
    const loopResult = await loop.execute(messages, tools, {
      agentType: run.agentType,
      modelId: input.modelId,
      providerId: input.providerId,
      temperature: 0.2,
    });

    recordAgenticLoopMetadata(run, loopResult);
    const loopOutput = buildAgenticLoopFinalOutput(loopResult);
    const finalOutput = await applyReviewerPassIfEnabled({
      run,
      originalPrompt: input.prompt,
      synthesisOutput: sanitizeUserFacingOutput(loopOutput),
      llmGateway: this.llmGateway,
    });
    return this.completeRunWithAssistantMessage(run, finalOutput);
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
    recordLifecycleStep(run, "TERMINAL", "status=CANCELLED");
    recordOrchestrationTerminal(run);
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

      const isTerminal = RunStateMachine.isTerminalState(existing.status);
      const isIdleCreated =
        existing.status === "CREATED" &&
        (await this.taskRepo.getByRun(runId)).length === 0;

      if (isTerminal || isIdleCreated) {
        return resetRecyclableRun({
          runId,
          sessionId,
          input,
          previousStatus: existing.status,
          taskRepo: this.taskRepo,
          runRepo: this.runRepo,
          createFreshRun: this.createFreshRun.bind(this),
        });
      }

      const requestedManifest = createRunManifest(input);
      ensureManifestMatch(existing.metadata.manifest, requestedManifest);

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
    const manifest = createRunManifest(input);
    return new Run(
      runId,
      sessionId,
      "CREATED",
      input.agentType,
      input,
      undefined,
      {
        prompt: input.prompt,
        manifest,
        orchestrationTelemetry: {
          activeDurationMs: 0,
          wakeupCount: 0,
          resumeCount: 0,
        },
        lifecycleSteps: [
          {
            step: "RUN_CREATED",
            recordedAt: new Date().toISOString(),
          },
        ],
      },
    );
  }

  private async createTasksFromPlan(
    runId: string,
    plan: ExecutablePlan,
  ): Promise<void> {
    for (const plannedTask of plan.tasks) {
      const task = this.createTaskFromPlanned(runId, plannedTask);
      await this.taskRepo.create(task);
    }

    console.log(
      `[run/engine] Created ${plan.tasks.length} tasks for run ${runId}`,
    );
  }

  private createTaskFromPlanned(
    runId: string,
    planned: ExecutablePlannedTask,
  ): Task {
    return new Task(
      planned.id,
      runId,
      planned.type,
      "PENDING",
      planned.dependsOn,
      {
        description: planned.description,
        expectedOutput: planned.expectedOutput,
        ...(planned.input ?? {}),
      },
    );
  }

  private async generatePlan(
    run: Run,
    prompt: string,
    memoryContext?: MemoryContext,
  ): Promise<ExecutablePlan> {
    const directPlan = buildDirectExecutionPlan(prompt);
    if (directPlan) {
      console.log(
        `[run/engine] Direct single-step plan selected for run ${run.id}: task=${directPlan.tasks[0]?.type ?? "unknown"}`,
      );
      return directPlan;
    }
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
      const taskSnapshots = tasks.map((task) => task.toJSON());
      return this.agent.synthesize({
        runId: run.id,
        sessionId: run.sessionId,
        completedTasks: taskSnapshots,
        originalPrompt,
        modelId: run.input.modelId,
        providerId: run.input.providerId,
      });
    }
    return synthesizeResultFromTasks({
      run,
      originalPrompt,
      memoryContext,
      taskRepo: this.taskRepo,
      memoryCoordinator: this.memoryCoordinator,
      llmGateway: this.llmGateway,
    });
  }

  private async executeConversationalTurn(
    run: Run,
    input: RunInput,
    messages: CoreMessage[],
  ): Promise<Response> {
    run.transition("RUNNING");
    await this.runRepo.update(run);

    try {
      const result = await this.llmGateway.generateText({
        context: {
          runId: run.id,
          sessionId: run.sessionId,
          agentType: run.agentType,
          phase: "synthesis",
        },
        messages,
        system: buildConversationalSystemPrompt(),
        model: input.modelId,
        providerId: input.providerId,
        temperature: 0.7,
        timeoutMs: 15_000,
      });
      return this.completeRunWithAssistantMessage(run, result.text);
    } catch (error) {
      if (error instanceof LLMTimeoutError && error.phase === "synthesis") {
        return this.completeRunWithRecoveredAssistantMessage(
          run,
          "The model took too long to respond. Please retry, or switch to a faster model for quick chat turns.",
          error.message,
        );
      }
      throw error;
    }
  }

  private createStreamResponse(content: string): Response {
    const safeContent = sanitizeUserFacingOutput(content);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(safeContent));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  }

  private async completeRunWithAssistantMessage(
    run: Run,
    text: string,
  ): Promise<Response> {
    const sanitizedText = sanitizeUserFacingOutput(text);
    recordLifecycleStep(run, "SYNTHESIS");

    await this.safeMemoryOperation(() =>
      this.memoryCoordinator.extractAndPersist({
        runId: run.id,
        sessionId: run.sessionId,
        source: "synthesis",
        content: sanitizedText,
        phase: "synthesis",
      }),
    );

    await this.safeMemoryOperation(() =>
      this.persistConversationMessages(
        run.id,
        run.sessionId,
        [{ role: "assistant", content: sanitizedText }],
        "assistant",
      ),
    );

    await this.safeMemoryOperation(() =>
      this.memoryCoordinator.createCheckpoint({
        runId: run.id,
        sequence: 1,
        phase: "synthesis",
        runStatus: "COMPLETED",
        taskStatuses: {},
      }),
    );
    transitionRunToCompleted(run, run.id);
    recordLifecycleStep(run, "TERMINAL", "status=COMPLETED");
    recordPhaseSelectionSnapshot(run, "synthesis");
    recordOrchestrationTerminal(run);
    run.output = { content: sanitizedText };
    await this.runRepo.update(run);
    console.log(`[run/engine] Completed conversational run ${run.id}`);

    return this.createStreamResponse(sanitizedText);
  }

  private async completeRunWithRecoveredAssistantMessage(
    run: Run,
    text: string,
    technicalError?: string,
  ): Promise<Response> {
    const sanitizedText = sanitizeUserFacingOutput(text);
    recordLifecycleStep(run, "SYNTHESIS", "planning_recovery");

    await this.safeMemoryOperation(() =>
      this.memoryCoordinator.extractAndPersist({
        runId: run.id,
        sessionId: run.sessionId,
        source: "synthesis",
        content: sanitizedText,
        phase: "synthesis",
      }),
    );

    await this.safeMemoryOperation(() =>
      this.persistConversationMessages(
        run.id,
        run.sessionId,
        [{ role: "assistant", content: sanitizedText }],
        "assistant",
      ),
    );

    transitionRunToCompleted(run, run.id);
    if (technicalError) {
      run.metadata.error = technicalError;
    }
    recordLifecycleStep(run, "TERMINAL", "status=COMPLETED:recoverable");
    recordOrchestrationTerminal(run);
    run.output = { content: sanitizedText };
    await this.runRepo.update(run);

    console.log(`[run/engine] Completed run ${run.id} with recoverable error`);
    return this.createStreamResponse(sanitizedText);
  }

  private async tryHandlePlanningError(
    run: Run,
    runId: string,
    error: unknown,
  ): Promise<Response | null> {
    const technicalMessage =
      error instanceof Error ? error.message : "Planning phase failed";
    const userMessage = buildPlanningRecoveryMessage(error);
    if (!userMessage) {
      return null;
    }

    console.log(
      `[run/engine] Recoverable planning error for run ${runId}: ${technicalMessage}`,
    );

    return this.completeRunWithRecoveredAssistantMessage(
      run,
      userMessage,
      technicalMessage,
    );
  }

  private async processPermissionDirectives(
    prompt: string,
  ): Promise<string | null> {
    return processPermissionDirectivesPolicy(
      prompt,
      this.permissionApprovalStore,
    );
  }

  private async getPermissionPolicyMessage(
    prompt: string,
    repositoryContext?: RepositoryContext,
  ): Promise<string | null> {
    return getPermissionPolicyMessage(
      prompt,
      repositoryContext,
      this.permissionApprovalStore,
    );
  }

  private async getWorkspaceBootstrapMessage(
    runId: string,
    repositoryContext?: RepositoryContext,
  ): Promise<string | null> {
    return getWorkspaceBootstrapMessage(
      runId,
      repositoryContext,
      this.workspaceBootstrapper,
    );
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
        transitionRunToFailed(run, runId);
        recordLifecycleStep(run, "TERMINAL", "status=FAILED");
        recordOrchestrationTerminal(run);
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
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      console.warn("[run/engine] Memory subsystem operation failed:", error);
      return undefined;
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

function buildRecoveredTurnModeDecision(error: unknown): TurnModeDecision {
  return {
    mode: "action",
    source: "recovered",
    rationale:
      error instanceof Error
        ? error.message
        : "Turn mode classification failed before planning.",
    confidence: 0,
  };
}
