import type { CoreMessage, CoreTool } from "ai";
import { z } from "zod";
import { Run, RunRepository, RunStateMachine } from "../run/index.js";
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
import { PlannerError, PlannerService } from "../planner/index.js";
import { TaskScheduler, type TaskExecutor } from "../orchestration/index.js";
import { DefaultTaskExecutor, AgentTaskExecutor } from "./TaskExecutor.js";
import { AgenticLoop, type AgenticLoopResult } from "./AgenticLoop.js";
import type {
  RunInput,
  RunStatus,
  IAgent,
  RuntimeDurableObjectState,
  RepositoryContext,
  WorkspaceBootstrapper,
  WorkspaceBootstrapResult,
} from "../types.js";
import type { Plan, PlannedTask } from "../planner/index.js";
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
  detectCrossRepoTarget,
  formatCrossRepoApprovalGrantedMessage,
  formatCrossRepoApprovalMessage,
  formatDestructiveApprovalGrantedMessage,
  formatDestructiveApprovalMessage,
  getSelectedRepoRef,
  isDestructiveActionPrompt,
  parsePermissionApprovalDirective,
} from "./RepositoryPermissionPolicy.js";
import {
  createRunManifest,
  ensureManifestMatch,
} from "./RunManifestPolicy.js";
import {
  buildConversationalSystemPrompt,
  hasRepositorySelection,
} from "./ConversationPolicy.js";
import { sanitizeUserFacingOutput } from "./RunOutputSanitizer.js";
import {
  applyFinalRunStatus,
  determineRunStatusFromTasks,
  transitionRunToCompleted,
  transitionRunToFailed,
} from "./RunStatusPolicy.js";
import {
  isPlatformApprovalOwner,
  recordLifecycleStep,
  recordOrchestrationActivation,
  recordOrchestrationTerminal,
  recordPhaseSelectionSnapshot,
} from "./RunMetadataPolicy.js";
import { resetRecyclableRun } from "./RunRecyclableResetPolicy.js";
import { applyReviewerPassIfEnabled } from "./RunReviewerPassPolicy.js";

const AGENTIC_LOOP_DEFAULT_MAX_STEPS = 6;
const STRUCTURED_SCHEMA_MISMATCH_SENTINEL =
  "No object generated: response did not match schema";
const TURN_MODE_SCHEMA = z.object({
  mode: z.enum(["chat", "action"]),
  rationale: z.string().max(400).optional(),
});
type TurnMode = z.infer<typeof TURN_MODE_SCHEMA>["mode"];
const AGENTIC_TOOL_SCHEMA = {
  analyze: z.object({
    path: z.string().min(1).max(500),
  }),
  edit: z.object({
    path: z.string().min(1).max(500),
    content: z.string().min(1),
  }),
  test: z.object({
    command: z.string().min(1).max(500),
  }),
  shell: z.object({
    command: z.string().min(1).max(500),
  }),
  git: z.object({
    action: z.string().min(1).max(120),
    message: z.string().max(500).optional(),
  }),
  review: z.object({
    notes: z.string().max(2000).optional(),
  }),
} as const;
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
      dependencies.scheduler ?? new TaskScheduler(this.taskRepo, this.taskExecutor);

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
    try {
      await this.sessionCostsLoaded;
      const run = await this.getOrCreateRun(input, runId, sessionId);
      recordOrchestrationActivation(run);
      await this.runRepo.update(run);
      console.log(`[run/engine] Retrieving memory context for run ${runId}`);
      this.currentMemoryContext = await this.safeMemoryOperation(
        () =>
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

      const turnMode = await this.determineTurnMode(run, input.prompt);
      if (turnMode === "chat") {
        console.log(
          `[run/engine] Model-selected conversational mode for run ${runId}`,
        );
        return await this.executeConversationalTurn(run, input, messages);
      }

      if (isPlatformApprovalOwner(run.metadata.manifest)) {
        const permissionMessage = await this.getPermissionPolicyMessage(
          input.prompt,
          input.repositoryContext,
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
          return await this.completeRunWithAssistantMessage(run, permissionMessage);
        }
      } else {
        console.log(
          `[run/engine] Delegated harness mode active; skipping platform approval gates for run ${runId}`,
        );
      }

      const bootstrapMessage = await this.getWorkspaceBootstrapMessage(
        run.id,
        input.repositoryContext,
      );
      if (bootstrapMessage) {
        console.log(
          `[run/engine] Workspace bootstrap blocked action planning for run ${runId}`,
        );
        return await this.completeRunWithAssistantMessage(run, bootstrapMessage);
      }

      const agenticLoopTools = this.resolveAgenticLoopTools(
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
        maxSteps: this.getAgenticLoopMaxSteps(run.input.metadata),
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

    this.recordAgenticLoopMetadata(run, loopResult);
    const loopOutput = this.buildAgenticLoopFinalOutput(loopResult);
    const finalOutput = await applyReviewerPassIfEnabled({
      run,
      originalPrompt: input.prompt,
      synthesisOutput: sanitizeUserFacingOutput(loopOutput),
      llmGateway: this.llmGateway,
    });
    return this.completeRunWithAssistantMessage(run, finalOutput);
  }

  private resolveAgenticLoopTools(
    metadata: Record<string, unknown> | undefined,
    incomingTools: Record<string, CoreTool>,
  ): Record<string, CoreTool> | null {
    if (!this.isAgenticLoopEnabled(metadata)) {
      return null;
    }
    if (Object.keys(incomingTools).length > 0) {
      return incomingTools;
    }
    return this.buildDefaultAgenticLoopTools();
  }

  private buildDefaultAgenticLoopTools(): Record<string, CoreTool> {
    return {
      analyze: {
        description: "Read and inspect an existing file path.",
        parameters: AGENTIC_TOOL_SCHEMA.analyze,
      } as unknown as CoreTool,
      edit: {
        description: "Write content to a file path.",
        parameters: AGENTIC_TOOL_SCHEMA.edit,
      } as unknown as CoreTool,
      test: {
        description: "Run a test command.",
        parameters: AGENTIC_TOOL_SCHEMA.test,
      } as unknown as CoreTool,
      shell: {
        description: "Run a non-git shell command.",
        parameters: AGENTIC_TOOL_SCHEMA.shell,
      } as unknown as CoreTool,
      git: {
        description: "Execute a structured git action.",
        parameters: AGENTIC_TOOL_SCHEMA.git,
      } as unknown as CoreTool,
      review: {
        description: "Run a focused review step.",
        parameters: AGENTIC_TOOL_SCHEMA.review,
      } as unknown as CoreTool,
    };
  }

  private buildAgenticLoopFinalOutput(result: AgenticLoopResult): string {
    const assistantText = this.getLastAssistantText(result.messages);
    if (assistantText) {
      return assistantText;
    }

    return [
      "Agentic loop completed without assistant synthesis output.",
      `Stop reason: ${result.stopReason}`,
      `Steps executed: ${result.stepsExecuted}`,
      `Tools executed: ${result.toolExecutionCount}`,
      `Failed tools: ${result.failedToolCount}`,
    ].join("\n");
  }

  private getLastAssistantText(messages: CoreMessage[]): string | null {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (!message || message.role !== "assistant") {
        continue;
      }
      if (typeof message.content === "string" && message.content.trim()) {
        return message.content;
      }
    }
    return null;
  }

  private recordAgenticLoopMetadata(run: Run, result: AgenticLoopResult): void {
    run.metadata.agenticLoop = {
      enabled: true,
      stopReason: result.stopReason,
      stepsExecuted: result.stepsExecuted,
      toolExecutionCount: result.toolExecutionCount,
      failedToolCount: result.failedToolCount,
      completedAt: new Date().toISOString(),
    };
  }

  private getAgenticLoopMaxSteps(metadata?: Record<string, unknown>): number {
    const featureFlags = metadata?.featureFlags;
    if (typeof featureFlags !== "object" || featureFlags === null) {
      return AGENTIC_LOOP_DEFAULT_MAX_STEPS;
    }
    const raw = (featureFlags as Record<string, unknown>).agenticLoopMaxSteps;
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0 && raw <= 20) {
      return raw;
    }
    return AGENTIC_LOOP_DEFAULT_MAX_STEPS;
  }

  private isAgenticLoopEnabled(metadata?: Record<string, unknown>): boolean {
    if (!metadata) {
      return false;
    }

    const directFlag = metadata.agenticLoopV1;
    if (typeof directFlag === "boolean") {
      return directFlag;
    }

    const featureFlags = metadata.featureFlags;
    if (typeof featureFlags !== "object" || featureFlags === null) {
      return false;
    }

    const nestedFlag = (featureFlags as Record<string, unknown>).agenticLoopV1;
    return typeof nestedFlag === "boolean" ? nestedFlag : false;
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
    return this.synthesizeResult(run, originalPrompt, memoryContext);
  }

  private async executeConversationalTurn(
    run: Run,
    input: RunInput,
    messages: CoreMessage[],
  ): Promise<Response> {
    run.transition("RUNNING");
    await this.runRepo.update(run);

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
    });
    return this.completeRunWithAssistantMessage(run, result.text);
  }

  private async determineTurnMode(
    run: Run,
    prompt: string,
  ): Promise<TurnMode> {
    const result = await this.llmGateway.generateStructured({
      context: {
        runId: run.id,
        sessionId: run.sessionId,
        agentType: run.agentType,
        phase: "planning",
      },
      schema: TURN_MODE_SCHEMA,
      messages: [
        {
          role: "system",
          content: [
            "Classify the user's latest request into a turn mode.",
            'Return "chat" when the request is conversational (greeting, Q&A, general explanation, capability question) and does not require repository/tool execution.',
            'Return "action" when the request requires reading/modifying repository files, running commands, or any tool execution.',
            "Respond strictly with schema-compliant JSON.",
          ].join(" "),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: run.input.modelId,
      providerId: run.input.providerId,
      temperature: 0,
    });

    const mode = result.object.mode;
    return mode === "chat" ? "chat" : "action";
  }

  private async synthesizeResult(
    run: Run,
    originalPrompt: string,
    memoryContext?: MemoryContext,
  ): Promise<string> {
    const tasks = await this.taskRepo.getByRun(run.id);
    const taskResults = tasks
      .map(
        (task) =>
          `- [${task.status}] ${task.type}: ${task.input.description}\n  Result: ${task.output?.content || task.error?.message || "N/A"}`,
      )
      .join("\n");

    const memorySection = memoryContext
      ? this.memoryCoordinator.formatContextForPrompt(memoryContext)
      : "";

    const synthesisPrompt = `Based on the following task outcomes, provide a final summary:

Original Request: ${originalPrompt}

${memorySection ? `Memory Context:\n${memorySection}\n\n` : ""}Completed Tasks:
${taskResults}

Provide a concise summary of what actually happened.
If any task failed or was cancelled, clearly say so and do not claim full completion.`;

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
          content:
            "You are a helpful assistant summarizing task execution results accurately.",
          },
          {
            role: "user",
            content: synthesisPrompt,
          },
        ],
        model: run.input.modelId,
        providerId: run.input.providerId,
        temperature: 0.7,
      });

      return result.text;
    } catch (error) {
      if (
        error instanceof BudgetExceededError ||
        error instanceof SessionBudgetExceededError
      ) {
        console.error(`[run/engine] Budget exceeded for run ${run.id}`);
        const completedTasks = tasks.filter((task) => task.status === "DONE").length;
        return `## Summary\n\nBudget limit reached for this run.\n\nCompleted ${completedTasks}/${tasks.length} tasks for your request.\n\n${taskResults}`;
      }
      console.error("[run/engine] Synthesis failed:", error);
      const completedTasks = tasks.filter((task) => task.status === "DONE").length;
      return `## Summary\n\nCompleted ${completedTasks}/${tasks.length} tasks for your request.\n\n${taskResults}`;
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

  private async completeRunWithFailedAssistantMessage(
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

    transitionRunToFailed(run, run.id);
    if (technicalError) {
      run.metadata.error = technicalError;
    }
    recordLifecycleStep(run, "TERMINAL", "status=FAILED");
    recordOrchestrationTerminal(run);
    run.output = { content: sanitizedText };
    await this.runRepo.update(run);

    console.warn(
      `[run/engine] Completed run ${run.id} with recoverable planning failure`,
    );
    return this.createStreamResponse(sanitizedText);
  }

  private async tryHandlePlanningError(
    run: Run,
    runId: string,
    error: unknown,
  ): Promise<Response | null> {
    const technicalMessage =
      error instanceof Error ? error.message : "Planning phase failed";
    const userMessage = this.buildPlanningRecoveryMessage(error);
    if (!userMessage) {
      return null;
    }

    console.warn(
      `[run/engine] Recoverable planning error for run ${runId}: ${technicalMessage}`,
    );

    return this.completeRunWithFailedAssistantMessage(
      run,
      userMessage,
      technicalMessage,
    );
  }

  private buildPlanningRecoveryMessage(error: unknown): string | null {
    if (this.isPlanningSchemaMismatchError(error)) {
      return [
        "I couldn't generate a valid structured plan for this turn, so I stopped before running tools.",
        "Try a more concrete request like `read README.md`, `list files in src`, or `run pnpm test`.",
        "If your request is conversational, retry in plain chat without asking for repository actions.",
      ].join(" ");
    }

    if (this.isPlanningTimeoutError(error)) {
      return [
        "Planning timed out before I could build safe executable tasks.",
        "Please retry with a narrower request (specific file path or command).",
      ].join(" ");
    }

    return null;
  }

  private isPlanningSchemaMismatchError(error: unknown): boolean {
    if (error instanceof PlannerError && error.code === "PLAN_SCHEMA_MISMATCH") {
      return true;
    }
    if (!(error instanceof Error)) {
      return false;
    }
    return error.message.includes(STRUCTURED_SCHEMA_MISMATCH_SENTINEL);
  }

  private isPlanningTimeoutError(error: unknown): boolean {
    if (error instanceof LLMTimeoutError) {
      return error.phase === "planning";
    }
    if (error instanceof PlannerError && error.code === "PLAN_GENERATION_TIMEOUT") {
      return true;
    }
    if (!(error instanceof Error)) {
      return false;
    }
    return (
      error.name === "LLMTimeoutError" &&
      error.message.includes("(phase=planning)")
    );
  }

  private async processPermissionDirectives(prompt: string): Promise<string | null> {
    const directive = parsePermissionApprovalDirective(prompt);
    if (!directive.isApprovalOnlyPrompt) {
      return null;
    }

    const approvalMessages: string[] = [];

    if (directive.crossRepo) {
      await this.permissionApprovalStore.grantCrossRepo(
        directive.crossRepo.repoRef,
        directive.crossRepo.ttlMs,
      );
      approvalMessages.push(
        formatCrossRepoApprovalGrantedMessage(
          directive.crossRepo.repoRef,
          directive.crossRepo.ttlMs,
        ),
      );
    }

    if (directive.destructive) {
      await this.permissionApprovalStore.grantDestructive(
        directive.destructive.ttlMs,
      );
      approvalMessages.push(
        formatDestructiveApprovalGrantedMessage(directive.destructive.ttlMs),
      );
    }

    if (approvalMessages.length === 0) {
      return null;
    }

    return `${approvalMessages.join(" ")} Re-send your repository action to continue.`;
  }

  private async getPermissionPolicyMessage(
    prompt: string,
    repositoryContext?: RepositoryContext,
  ): Promise<string | null> {
    const selectedRepoRef = getSelectedRepoRef(repositoryContext);
    const crossRepoTarget = detectCrossRepoTarget(prompt, selectedRepoRef);

    if (crossRepoTarget) {
      const allowed =
        await this.permissionApprovalStore.hasCrossRepo(crossRepoTarget);
      if (!allowed) {
        return formatCrossRepoApprovalMessage(crossRepoTarget, selectedRepoRef);
      }
    }

    if (isDestructiveActionPrompt(prompt)) {
      const allowed = await this.permissionApprovalStore.hasDestructive();
      if (!allowed) {
        return formatDestructiveApprovalMessage();
      }
    }

    return null;
  }

  private async getWorkspaceBootstrapMessage(
    runId: string,
    repositoryContext?: RepositoryContext,
  ): Promise<string | null> {
    if (!repositoryContext || !this.workspaceBootstrapper) {
      return null;
    }

    if (!hasRepositorySelection(repositoryContext)) {
      return "I need a valid repository selection before I can run repository actions. Please reselect the repository and try again.";
    }

    try {
      const bootstrapResult = await this.workspaceBootstrapper.bootstrap({
        runId,
        repositoryContext,
      });
      return this.mapBootstrapResultToMessage(bootstrapResult, repositoryContext);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "workspace bootstrap failed";
      const repoRef = this.describeRepositoryRef(repositoryContext);
      return `I couldn't prepare the workspace for ${repoRef}. ${errorMessage}`;
    }
  }

  private mapBootstrapResultToMessage(
    bootstrapResult: WorkspaceBootstrapResult,
    repositoryContext: RepositoryContext,
  ): string | null {
    if (bootstrapResult.status === "ready") {
      return null;
    }

    if (bootstrapResult.status === "needs-auth") {
      return (
        bootstrapResult.message ??
        "I need GitHub authorization before I can access this repository. Please reconnect GitHub and try again."
      );
    }

    if (bootstrapResult.status === "invalid-context") {
      return (
        bootstrapResult.message ??
        "I need valid repository details (owner, repository, branch) before I can continue."
      );
    }

    const repoRef = this.describeRepositoryRef(repositoryContext);
    const reason =
      bootstrapResult.message ??
      "Repository sync failed. Please confirm the branch exists and retry.";
    return `I couldn't prepare the workspace for ${repoRef}. ${reason}`;
  }

  private describeRepositoryRef(repositoryContext: RepositoryContext): string {
    const owner = repositoryContext.owner?.trim() || "unknown-owner";
    const repo = repositoryContext.repo?.trim() || "unknown-repo";
    const branch = repositoryContext.branch?.trim();
    return branch ? `${owner}/${repo}@${branch}` : `${owner}/${repo}`;
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
