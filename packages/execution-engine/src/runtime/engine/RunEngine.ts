import type { CoreMessage, CoreTool } from "ai";
import { RUN_WORKFLOW_STEPS, type RunEvent } from "@repo/shared-types";
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
import { executeAgenticLoopTool } from "./AgenticLoopToolExecutor.js";
import {
  enforceGoldenFlowToolFloor,
  isGoldenFlowToolName,
} from "../contracts/CodingToolGateway.js";
import type {
  RunInput,
  RunStatus,
  IAgent,
  RepositoryContext,
  RuntimeDurableObjectState,
  WorkspaceBootstrapper,
} from "../types.js";
import type { Plan } from "../planner/index.js";
import { BaseAgent } from "../agents/BaseAgent.js";
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
  completeRunWithRecoveredAssistantMessage as completeRunWithRecoveredAssistantMessagePolicy,
  getRunDurationMs as getRunDurationMsPolicy,
  tryHandlePlanningError as tryHandlePlanningErrorPolicy,
  type RunCompletionDependencies,
} from "./RunCompletionPolicy.js";
import { createRunManifest, ensureManifestMatch } from "./RunManifestPolicy.js";
import { sanitizeUserFacingOutput } from "./RunOutputSanitizer.js";
import {
  transitionRunToCompleted,
  transitionRunToFailed,
} from "./RunStatusPolicy.js";
import {
  buildTaskModelNoActionMetadata,
  buildTaskModelNoActionSummary,
  buildAgenticLoopFinalMessage,
  getAgenticLoopMaxSteps,
  recordRecoveredAgenticLoopMetadata,
  recordAgenticLoopMetadata,
} from "./RunAgenticLoopPolicy.js";
import {
  buildPlanModeResponse,
  persistPlanArtifact,
} from "./RunPlanModePolicy.js";
import {
  isPlatformApprovalOwner,
  recordLifecycleStep,
  recordOrchestrationActivation,
  recordOrchestrationTerminal,
  recordPhaseSelectionSnapshot,
} from "./RunMetadataPolicy.js";
import { resetRecyclableRun } from "./RunRecyclableResetPolicy.js";
import { applyReviewerPassIfEnabled } from "./RunReviewerPassPolicy.js";
import { RunEventRecorder, RunEventRepository } from "../events/index.js";
import {
  LLMTimeoutError,
  LLMUnusableResponseError,
} from "../llm/LLMGateway.js";
import { getToolPresentation } from "../lib/ToolPresentation.js";
import { detectsMutation } from "./detectsMutation.js";

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
  runEventListener?: (event: RunEvent) => Promise<void> | void;
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
      dependencies.runEventListener,
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
      const runMode = run.metadata.manifest?.mode ?? "build";

      if (
        runMode === "build" &&
        isPlatformApprovalOwner(run.metadata.manifest)
      ) {
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
          `[run/engine] Skipping platform approval directives for run ${runId} mode=${runMode}`,
        );
      }

      if (
        runMode === "build" &&
        isPlatformApprovalOwner(run.metadata.manifest)
      ) {
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
          `[run/engine] Skipping platform approval gates for run ${runId} mode=${runMode}`,
        );
      }

      if (runMode === "build") {
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
        const planArtifact = persistPlanArtifact(run, plan);
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
        await this.runRepo.update(run);

        return await this.completeRunWithAssistantMessage(
          run,
          buildPlanModeResponse(planArtifact),
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
    const directExecutionService =
      this.agent instanceof BaseAgent
        ? this.agent.getRuntimeExecutionService()
        : undefined;
    try {
      const loopResult = await loop.execute(messages, tools, {
        agentType: run.agentType,
        workspaceContext: buildAgenticLoopWorkspaceContext(input),
        executeTool: directExecutionService
          ? async (toolCall) => {
              const toolPresentation = getToolPresentation(
                toolCall.toolName,
                toolCall.args,
              );
              if (!isGoldenFlowToolName(toolCall.toolName)) {
                throw new Error(
                  `Unsupported direct agentic tool: ${toolCall.toolName}`,
                );
              }
              return executeAgenticLoopTool(directExecutionService, {
                taskId: toolCall.id,
                toolName: toolCall.toolName,
                toolInput: {
                  description: toolPresentation.description,
                  displayText: toolPresentation.displayText,
                  ...toolCall.args,
                },
                onOutputAppended: async (chunk) => {
                  await this.runEventRecorder.recordToolOutputAppended(
                    {
                      id: toolCall.id,
                      type: toolCall.toolName,
                    },
                    chunk,
                  );
                },
              });
            }
          : undefined,
        modelId: input.modelId,
        providerId: input.providerId,
        temperature: 0.2,
        onToolRequested: async (toolCall) => {
          const toolPresentation = getToolPresentation(
            toolCall.toolName,
            toolCall.args,
          );
          await this.runEventRecorder.recordToolRequested({
            id: toolCall.id,
            type: toolCall.toolName,
            input: {
              ...toolCall.args,
              description: toolPresentation.description,
              displayText: toolPresentation.displayText,
            },
          });
        },
        onProgress: async (progress) => {
          if (!progress) {
            return;
          }
          await this.runEventRecorder.recordRunProgress(
            progress.phase,
            progress.label,
            progress.summary,
            progress.status,
          );
        },
        onAssistantMessage: async (content) => {
          await this.runEventRecorder.recordMessageEmitted(
            "assistant",
            content,
            undefined,
            {
              phase: "commentary",
              status: "completed",
            },
          );
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
      const finalMessage = buildAgenticLoopFinalMessage(loopResult);
      const finalOutput = finalMessage.metadata
        ? finalMessage.text
        : await applyReviewerPassIfEnabled({
            run,
            originalPrompt: input.prompt,
            synthesisOutput: sanitizeUserFacingOutput(finalMessage.text),
            llmGateway: this.llmGateway,
          });
      return this.completeRunWithAssistantMessage(
        run,
        finalOutput,
        finalMessage.metadata,
      );
    } catch (error) {
      const recoveryResponse = await this.tryHandleTaskExecutionError(
        run,
        input.prompt,
        loop,
        error,
      );
      if (recoveryResponse) {
        return recoveryResponse;
      }
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

  private async completeRunWithAssistantMessage(
    run: Run,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<Response> {
    return completeRunWithAssistantMessagePolicy({
      run,
      text,
      metadata,
      deps: this.getRunCompletionDependencies(),
    });
  }

  private async completeRunWithRecoveredAssistantMessage(
    run: Run,
    text: string,
    metadata?: Record<string, unknown>,
    errorMetadata?: string,
  ): Promise<Response> {
    return completeRunWithRecoveredAssistantMessagePolicy({
      run,
      text,
      metadata,
      errorMetadata,
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

  private async tryHandleTaskExecutionError(
    run: Run,
    prompt: string,
    loop: AgenticLoop,
    error: unknown,
  ): Promise<Response | null> {
    if (isTaskExecutionTimeout(error)) {
      const stats = loop.getStats();
      const requiresMutation = detectsMutation(prompt);
      const noFileChanged =
        !requiresMutation || stats.completedMutatingToolCount === 0;
      const text = buildTaskExecutionTimeoutMessage({
        requiresMutation,
        noFileChanged,
        toolExecutionCount: stats.toolExecutionCount,
        stepsExecuted: stats.stepsExecuted,
      });
      await this.runEventRecorder.recordRunProgress(
        RUN_WORKFLOW_STEPS.EXECUTION,
        "Recoverable timeout",
        "The model timed out before choosing the next action.",
        "completed",
      );

      return this.completeRunWithRecoveredAssistantMessage(
        run,
        text,
        buildTaskExecutionTimeoutMetadata(),
        "TASK_EXECUTION_TIMEOUT: Model timed out before choosing the next action.",
      );
    }

    if (!isTaskExecutionUnusableResponse(error)) {
      return null;
    }

    const stats = loop.getStats();
    const requiresMutation = detectsMutation(prompt);
    const recoveryStopReason =
      requiresMutation && stats.completedMutatingToolCount === 0
        ? "incomplete_mutation"
        : "llm_stop";

    recordRecoveredAgenticLoopMetadata(run, {
      stopReason: recoveryStopReason,
      stepsExecuted: stats.stepsExecuted,
      toolExecutionCount: stats.toolExecutionCount,
      failedToolCount: stats.failedToolCount,
      requiresMutation,
      completedMutatingToolCount: stats.completedMutatingToolCount,
      completedReadOnlyToolCount: stats.completedReadOnlyToolCount,
      llmRetryCount: stats.llmRetryCount,
      terminalLlmIssue:
        stats.terminalLlmIssue ?? buildTerminalLlmIssueFromError(error),
      recoveryCode: "TASK_MODEL_NO_ACTION",
      toolLifecycle: stats.toolLifecycle,
    });

    await this.runEventRecorder.recordRunProgress(
      RUN_WORKFLOW_STEPS.EXECUTION,
      "Recoverable model issue",
      "The model returned an unusable response before the run could continue.",
      "completed",
    );

    return this.completeRunWithRecoveredAssistantMessage(
      run,
      buildTaskModelNoActionSummary({
        requiresMutation,
        stepsExecuted: stats.stepsExecuted,
        toolExecutionCount: stats.toolExecutionCount,
        failedToolCount: stats.failedToolCount,
        toolLifecycle: stats.toolLifecycle,
      }),
      buildTaskModelNoActionMetadata(),
      buildUnusableResponseErrorMetadata(
        error,
        stats.terminalLlmIssue ?? buildTerminalLlmIssueFromError(error),
      ),
    );
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

function buildAgenticLoopWorkspaceContext(
  input: Pick<RunInput, "repositoryContext">,
): string | undefined {
  const repositoryContext = input.repositoryContext;
  if (!repositoryContext) {
    return undefined;
  }

  const repoName =
    repositoryContext.owner && repositoryContext.repo
      ? `${repositoryContext.owner}/${repositoryContext.repo}`
      : (repositoryContext.repo ?? repositoryContext.owner);
  const lines: string[] = [];

  if (repoName) {
    lines.push(`Repository: ${repoName}`);
  }

  if (repositoryContext.branch) {
    lines.push(`Branch: ${repositoryContext.branch}`);
  }

  lines.push(
    "The checked-out workspace is the source of truth. Inspect the real tree and answer from observed files or git state.",
  );

  return lines.join("\n");
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

function isTaskExecutionTimeout(error: unknown): boolean {
  if (error instanceof LLMTimeoutError) {
    return error.phase === "task";
  }

  return (
    error instanceof Error &&
    error.name === "LLMTimeoutError" &&
    error.message.includes("(phase=task)")
  );
}

function isTaskExecutionUnusableResponse(
  error: unknown,
): error is LLMUnusableResponseError {
  return error instanceof LLMUnusableResponseError;
}

function buildTaskExecutionTimeoutMessage(input: {
  requiresMutation: boolean;
  noFileChanged: boolean;
  toolExecutionCount: number;
  stepsExecuted: number;
}): string {
  const lines = [
    "The model timed out before choosing the next action.",
    input.noFileChanged
      ? "No file was changed before the timeout."
      : "The run timed out after some progress, but before it could finish the next step.",
    `Execution stats so far: ${input.stepsExecuted} step(s), ${input.toolExecutionCount} tool call(s).`,
  ];

  if (input.requiresMutation) {
    lines.push(
      "Retry this task with a more specific file or component target, or switch to a faster or more reliable model.",
    );
  } else {
    lines.push("Retry the task or switch to a faster or more reliable model.");
  }

  return lines.join("\n");
}

function buildTaskExecutionTimeoutMetadata(): Record<string, unknown> {
  return {
    code: "TASK_EXECUTION_TIMEOUT",
    retryable: true,
    resumeHint:
      "Retry the task or switch to a faster or more reliable model.",
    resumeActions: ["retry", "switch_model"],
  };
}

function buildTerminalLlmIssueFromError(
  error: LLMUnusableResponseError,
): NonNullable<Run["metadata"]["agenticLoop"]>["terminalLlmIssue"] {
  return {
    type: "unusable_response",
    providerId: error.providerId,
    modelId: error.modelId,
    anomalyCode: error.anomalyCode,
    finishReason: error.finishReason,
    statusCode: error.statusCode,
    attempts: 2,
  };
}

function buildUnusableResponseErrorMetadata(
  error: LLMUnusableResponseError,
  terminalLlmIssue:
    | NonNullable<Run["metadata"]["agenticLoop"]>["terminalLlmIssue"]
    | undefined,
): string {
  const attempts = terminalLlmIssue?.attempts ?? 2;
  const finishReason =
    terminalLlmIssue?.finishReason ?? error.finishReason ?? "unknown";
  const statusCode = terminalLlmIssue?.statusCode ?? error.statusCode;
  const suffix =
    typeof statusCode === "number"
      ? ` finishReason=${finishReason} statusCode=${statusCode}`
      : ` finishReason=${finishReason}`;

  return `TASK_MODEL_NO_ACTION: Unusable model response after ${attempts} attempt(s). provider=${error.providerId} model=${error.modelId} anomaly=${error.anomalyCode}${suffix}`;
}
