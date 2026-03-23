import type { CoreMessage, CoreTool } from "ai";
import { RUN_WORKFLOW_STEPS } from "@repo/shared-types";
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
import { enforceGoldenFlowToolFloor } from "../contracts/CodingToolGateway.js";
import type {
  RunInput,
  RunStatus,
  IAgent,
  RepositoryContext,
  RuntimeDurableObjectState,
  WorkspaceBootstrapper,
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
import { PermissionApprovalStore } from "./PermissionApprovalStore.js";
import {
  getPermissionPolicyMessage,
  getWorkspaceBootstrapMessage,
  processPermissionDirectives as processPermissionDirectivesPolicy,
} from "./RunPermissionWorkspacePolicy.js";
import {
  completeRunWithAssistantMessage as completeRunWithAssistantMessagePolicy,
  createStreamResponse as createStreamResponsePolicy,
  getRunDurationMs as getRunDurationMsPolicy,
  tryHandlePlanningError as tryHandlePlanningErrorPolicy,
  type RunCompletionDependencies,
} from "./RunCompletionPolicy.js";
import { createRunManifest, ensureManifestMatch } from "./RunManifestPolicy.js";
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
} from "./RunAgenticLoopPolicy.js";
import {
  isPlatformApprovalOwner,
  recordLifecycleStep,
  recordOrchestrationActivation,
  recordOrchestrationTerminal,
  recordPhaseSelectionSnapshot,
} from "./RunMetadataPolicy.js";
import { resetRecyclableRun } from "./RunRecyclableResetPolicy.js";
import { applyReviewerPassIfEnabled } from "./RunReviewerPassPolicy.js";
import { synthesizeResultFromTasks } from "./RunSynthesisPolicy.js";
import { RunEventRecorder, RunEventRepository } from "../events/index.js";

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
  private runEventRepo: RunEventRepository;
  private runEventRecorder: RunEventRecorder;
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
    this.runEventRepo = new RunEventRepository(ctx);
    this.runEventRecorder = new RunEventRecorder(
      this.runEventRepo,
      options.runId,
      options.sessionId,
    );

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
      await this.runEventRecorder.ensureRunStarted(run.status);
      await this.recordCurrentUserTurn(input.prompt);
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

      const runMode = run.metadata.manifest?.mode ?? "build";
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

      if (runMode === "build") {
        return await this.executeAgenticLoopPath(
          run,
          input,
          messages,
          enforceGoldenFlowToolFloor(tools),
        );
      }

      console.log(
        `[run/engine] Explicit plan mode planning phase for run ${runId}`,
      );
      try {
        const previousPlanningStatus = run.status;
        if (run.status === "CREATED") {
          run.transition("PLANNING");
        }
        if (
          previousPlanningStatus !== run.status ||
          run.status === "PLANNING"
        ) {
          await this.runEventRecorder.recordRunStatusChanged(
            previousPlanningStatus,
            run.status,
            RUN_WORKFLOW_STEPS.PLANNING,
          );
        }
        recordPhaseSelectionSnapshot(run, "planning");
        await this.runRepo.update(run);

        const plan = await this.generatePlan(
          run,
          input.prompt,
          this.currentMemoryContext,
        );
        await this.createTasksFromPlan(run.id, plan);
        recordLifecycleStep(run, "PLAN_VALIDATED");

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
      const executionPreviousStatus = run.status;
      run.transition("RUNNING");
      recordPhaseSelectionSnapshot(run, "execution");
      recordLifecycleStep(run, "TASK_EXECUTING");
      await this.runEventRecorder.recordRunStatusChanged(
        executionPreviousStatus,
        run.status,
        RUN_WORKFLOW_STEPS.EXECUTION,
      );
      await this.runRepo.update(run);

      const taskResults: Array<{ taskId: string; content: string }> = [];

      await this.scheduler.execute(run.id, {
        beforeTask: async (task) => {
          console.log(
            `[task/scheduler] beforeTask run=${run.id} task=${task.id} phase=task`,
          );
          await this.runEventRecorder.recordToolRequested(task);
          await this.runEventRecorder.recordToolStarted(task);
        },
        afterTask: async (task, result) => {
          console.log(
            `[task/scheduler] afterTask run=${run.id} task=${task.id} status=${result.status}`,
          );
          await this.runEventRecorder.recordToolCompleted(
            task,
            result.output?.content ?? null,
            0,
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
          await this.runEventRecorder.recordToolFailed(
            task,
            error instanceof Error ? error.message : "Task execution failed",
            0,
          );
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
      await this.runEventRecorder.recordRunStatusChanged(
        run.status,
        run.status,
        RUN_WORKFLOW_STEPS.SYNTHESIS,
      );
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
      await this.runEventRecorder.recordMessageEmitted(
        "assistant",
        finalOutput,
      );
      if (finalRunStatus === "COMPLETED") {
        await this.runEventRecorder.recordRunCompleted(
          this.getRunDurationMs(run),
          allTasks.length,
        );
      } else if (finalRunStatus === "FAILED") {
        await this.runEventRecorder.recordRunFailed(
          run.metadata.error ?? "One or more tasks failed",
          this.getRunDurationMs(run),
        );
      }
      console.log(`[run/engine] Completed run ${runId}`);
      console.log(
        `[run/timing] run=${runId} step=total elapsedMs=${Date.now() - runStartedAt} status=${finalRunStatus} mode=task`,
      );
      return createStreamResponsePolicy(finalOutput);
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
    const previousStatus = run.status;
    run.transition("RUNNING");
    recordPhaseSelectionSnapshot(run, "execution");
    recordLifecycleStep(run, "TASK_EXECUTING", "agentic_loop");
    await this.runEventRecorder.recordRunStatusChanged(
      previousStatus,
      run.status,
      RUN_WORKFLOW_STEPS.EXECUTION,
    );
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
      onToolRequested: async (toolCall) => {
        await this.runEventRecorder.recordToolRequested({
          id: toolCall.id,
          type: toolCall.toolName,
          input: toolCall.args,
        });
      },
      onToolStarted: async (toolCall) => {
        await this.runEventRecorder.recordToolStarted({
          id: toolCall.id,
          type: toolCall.toolName,
        });
      },
      onToolCompleted: async (toolCall, result, executionTimeMs) => {
        await this.runEventRecorder.recordToolCompleted(
          {
            id: toolCall.id,
            type: toolCall.toolName,
          },
          result,
          executionTimeMs,
        );
      },
      onToolFailed: async (toolCall, error, executionTimeMs) => {
        await this.runEventRecorder.recordToolFailed(
          {
            id: toolCall.id,
            type: toolCall.toolName,
          },
          error,
          executionTimeMs,
        );
      },
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

  private getRunCompletionDependencies(): RunCompletionDependencies {
    return {
      memoryCoordinator: this.memoryCoordinator,
      persistConversationMessages: this.persistConversationMessages.bind(this),
      runEventRecorder: this.runEventRecorder,
      runRepo: this.runRepo,
      safeMemoryOperation: this.safeMemoryOperation.bind(this),
    };
  }

  private async recordCurrentUserTurn(prompt: string): Promise<void> {
    await this.runEventRecorder.recordMessageEmitted("user", prompt);
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
          clearRunEvents: () => this.runEventRecorder.clear(),
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
        ...(planned.input ?? {}),
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

  private async completeRunWithAssistantMessage(
    run: Run,
    text: string,
  ): Promise<Response> {
    return completeRunWithAssistantMessagePolicy({
      run,
      text,
      deps: this.getRunCompletionDependencies(),
    });
  }

  private async tryHandlePlanningError(
    run: Run,
    runId: string,
    error: unknown,
  ): Promise<Response | null> {
    return tryHandlePlanningErrorPolicy({
      run,
      runId,
      error,
      deps: this.getRunCompletionDependencies(),
    });
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
        if (run.status === "FAILED") {
          await this.runEventRecorder.recordRunFailed(
            errorMessage,
            this.getRunDurationMs(run),
          );
        }
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

  private getRunDurationMs(run: Run): number {
    return getRunDurationMsPolicy(run);
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
