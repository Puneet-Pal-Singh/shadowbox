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
import { PlannerService } from "../planner/index.js";
import { TaskScheduler, type TaskExecutor } from "../orchestration/index.js";
import { DefaultTaskExecutor, AgentTaskExecutor } from "./TaskExecutor.js";
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
  getActionClarificationMessage,
  hasRepositorySelection,
  shouldBypassPlanning,
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
import { AgenticLoop, type StopReason as AgenticLoopStopReason } from "./AgenticLoop.js";

const ReviewerDecisionSchema = z.object({
  verdict: z.enum(["accept", "request_changes", "fail"]),
  summary: z.string().trim().min(1),
  issues: z.array(z.string().trim().min(1)).max(10).default([]),
});

type ReviewerDecision = z.infer<typeof ReviewerDecisionSchema>;
const DEFAULT_AGENTIC_LOOP_MAX_STEPS = 8;
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
  FEATURE_FLAG_CHAT_AGENTIC_LOOP_V1?: string;
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

      const bypassPlanning = shouldBypassPlanning(input.prompt);
      if (bypassPlanning) {
        console.log(`[run/engine] Conversational bypass for run ${runId}`);
        return await this.executeConversationalTurn(run, input, messages);
      }

      return await this.executeActionRun(run, input, messages, tools);
    } catch (error) {
      await this.handleExecutionError(runId, error);
      throw error;
    }
  }

  private async executeActionRun(
    run: Run,
    input: RunInput,
    messages: CoreMessage[],
    tools: Record<string, CoreTool>,
  ): Promise<Response> {
    const clarificationMessage = getActionClarificationMessage(
      input.prompt,
      input.repositoryContext,
    );
    if (clarificationMessage) {
      console.log(
        `[run/engine] Clarification required before action planning for run ${run.id}`,
      );
      return await this.completeRunWithAssistantMessage(run, clarificationMessage);
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
          `[run/engine] Permission check blocked action planning for run ${run.id}`,
        );
        return await this.completeRunWithAssistantMessage(run, permissionMessage);
      }
    } else {
      console.log(
        `[run/engine] Delegated harness mode active; skipping platform approval gates for run ${run.id}`,
      );
    }

    const bootstrapMessage = await this.getWorkspaceBootstrapMessage(
      run.id,
      input.repositoryContext,
    );
    if (bootstrapMessage) {
      console.log(
        `[run/engine] Workspace bootstrap blocked action planning for run ${run.id}`,
      );
      return await this.completeRunWithAssistantMessage(run, bootstrapMessage);
    }

    if (this.shouldUseAgenticLoop(input.metadata, tools)) {
      console.log(
        `[run/engine] Agentic loop execution path enabled for run ${run.id}`,
      );
      return await this.executeAgenticLoopRun(run, input, messages, tools);
    }

    return this.executePlannedRun(run, input);
  }

  private async executePlannedRun(run: Run, input: RunInput): Promise<Response> {
    const runId = run.id;
    const sessionId = run.sessionId;

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
          allTasks.map((task) => [task.id, task.status]),
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
    const finalOutput = await this.applyReviewerPassIfEnabled(
      run,
      input.prompt,
      sanitizeUserFacingOutput(finalOutputRaw),
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
  }

  private async executeAgenticLoopRun(
    run: Run,
    input: RunInput,
    messages: CoreMessage[],
    tools: Record<string, CoreTool>,
  ): Promise<Response> {
    const runId = run.id;
    const sessionId = run.sessionId;

    run.transition("RUNNING");
    recordPhaseSelectionSnapshot(run, "planning");
    recordLifecycleStep(run, "PLAN_VALIDATED", "agentic-loop");
    recordPhaseSelectionSnapshot(run, "execution");
    recordLifecycleStep(run, "TASK_EXECUTING", "agentic-loop");
    await this.runRepo.update(run);

    await this.safeMemoryOperation(() =>
      this.memoryCoordinator.createCheckpoint({
        runId,
        sequence: 1,
        phase: "planning",
        runStatus: run.status,
        taskStatuses: {},
      }),
    );

    const loop = new AgenticLoop(
      {
        maxSteps: this.getAgenticLoopMaxSteps(run.input.metadata),
        runId,
        sessionId,
        budget: this.budgetManager,
      },
      this.llmGateway,
      this.taskExecutor,
    );
    const loopResult = await loop.execute(messages, tools, {
      agentType: run.agentType,
      modelId: run.input.modelId,
      providerId: run.input.providerId,
      temperature: 0.3,
    });

    if (this.getAgenticLoopTerminalStatus(loopResult.stopReason) === "FAILED") {
      throw new RunEngineError(
        `Agentic loop failed for run ${runId} with stop reason ${loopResult.stopReason}`,
      );
    }

    await this.safeMemoryOperation(() =>
      this.memoryCoordinator.createCheckpoint({
        runId,
        sequence: 2,
        phase: "execution",
        runStatus: run.status,
        taskStatuses: {},
      }),
    );

    console.log(`[run/engine] Synthesis phase for run ${runId}`);
    recordPhaseSelectionSnapshot(run, "synthesis");
    recordLifecycleStep(run, "SYNTHESIS");
    const finalOutputRaw = this.extractAgenticLoopOutput(loopResult);
    const finalOutput = await this.applyReviewerPassIfEnabled(
      run,
      input.prompt,
      sanitizeUserFacingOutput(finalOutputRaw),
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
    transitionRunToCompleted(run, runId);
    recordLifecycleStep(run, "TERMINAL", "status=COMPLETED");
    recordOrchestrationTerminal(run);
    run.output = { content: finalOutput };
    await this.runRepo.update(run);
    console.log(`[run/engine] Completed run ${runId}`);
    return this.createStreamResponse(finalOutput);
  }

  private extractAgenticLoopOutput(result: {
    stopReason: AgenticLoopStopReason;
    messages: CoreMessage[];
  }): string {
    const assistantMessage = [...result.messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" && typeof message.content === "string",
      );

    const assistantText =
      typeof assistantMessage?.content === "string"
        ? assistantMessage.content
        : "I completed the tool-chaining loop but could not produce a text response.";

    if (result.stopReason === "max_steps_reached") {
      return `${assistantText}\n\nI reached the configured tool-chaining step limit before receiving an explicit final stop.`;
    }

    return assistantText;
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

  private async applyReviewerPassIfEnabled(
    run: Run,
    originalPrompt: string,
    synthesisOutput: string,
  ): Promise<string> {
    if (!this.isReviewerPassEnabled(run.input.metadata)) {
      this.setReviewerPassDisabled(run);
      return synthesisOutput;
    }

    console.log(`[run/engine] Reviewer pass enabled for run ${run.id}`);
    const decision = await this.generateReviewerDecision(
      run,
      originalPrompt,
      synthesisOutput,
    );
    if (!decision) {
      return synthesisOutput;
    }

    this.recordReviewerDecision(run, decision);
    if (decision.verdict === "accept") {
      return synthesisOutput;
    }

    recordLifecycleStep(run, "SYNTHESIS", `reviewer=${decision.verdict}`);
    return `${synthesisOutput}\n\n${this.formatReviewerSuffix(decision)}`;
  }

  private setReviewerPassDisabled(run: Run): void {
    run.metadata.reviewerPass = {
      enabled: false,
      applied: false,
    };
  }

  private async generateReviewerDecision(
    run: Run,
    originalPrompt: string,
    synthesisOutput: string,
  ): Promise<ReviewerDecision | null> {
    try {
      const reviewResult = await this.llmGateway.generateStructured({
        context: {
          runId: run.id,
          sessionId: run.sessionId,
          agentType: "review",
          phase: "synthesis",
        },
        messages: this.buildReviewerMessages(originalPrompt, synthesisOutput),
        schema: ReviewerDecisionSchema,
        model: run.input.modelId,
        providerId: run.input.providerId,
        temperature: 0.1,
      });
      return {
        ...reviewResult.object,
        issues: reviewResult.object.issues ?? [],
      };
    } catch (error) {
      this.recordReviewerPassFailure(run, error);
      return null;
    }
  }

  private buildReviewerMessages(
    originalPrompt: string,
    synthesisOutput: string,
  ): CoreMessage[] {
    return [
      {
        role: "system",
        content:
          "Review the candidate response for correctness and regressions. Return a strict verdict and concise review notes.",
      },
      {
        role: "user",
        content: [
          "Original user request:",
          originalPrompt,
          "",
          "Candidate synthesis output:",
          synthesisOutput,
        ].join("\n"),
      },
    ];
  }

  private recordReviewerDecision(run: Run, decision: ReviewerDecision): void {
    run.metadata.reviewerPass = {
      enabled: true,
      verdict: decision.verdict,
      summary: decision.summary,
      issues: decision.issues,
      reviewedAt: new Date().toISOString(),
      applied: decision.verdict !== "accept",
    };
  }

  private recordReviewerPassFailure(run: Run, error: unknown): void {
    const message = error instanceof Error ? error.message : "reviewer pass failed";
    run.metadata.reviewerPass = {
      enabled: true,
      verdict: "fail",
      summary: "Reviewer pass failed; returning generator output.",
      issues: [],
      reviewedAt: new Date().toISOString(),
      applied: false,
      error: message,
    };
    console.warn(`[run/engine] Reviewer pass failed for run ${run.id}: ${message}`);
  }

  private formatReviewerSuffix(decision: ReviewerDecision): string {
    const issueLines =
      decision.issues.length > 0
        ? decision.issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n")
        : "1. No detailed issue list provided by reviewer.";

    return [
      "---",
      `Reviewer Note (${decision.verdict})`,
      decision.summary,
      "",
      "Reviewer Issues:",
      issueLines,
    ].join("\n");
  }

  private shouldUseAgenticLoop(
    metadata: Record<string, unknown> | undefined,
    tools: Record<string, CoreTool>,
  ): boolean {
    return this.isAgenticLoopEnabled(metadata) && Object.keys(tools).length > 0;
  }

  private isAgenticLoopEnabled(
    metadata: Record<string, unknown> | undefined,
  ): boolean {
    if (metadata) {
      const directFlag = metadata.agenticLoopV1;
      if (typeof directFlag === "boolean") {
        return directFlag;
      }

      const featureFlags = metadata.featureFlags;
      if (typeof featureFlags === "object" && featureFlags !== null) {
        const nestedFlag = (featureFlags as Record<string, unknown>).agenticLoopV1;
        if (typeof nestedFlag === "boolean") {
          return nestedFlag;
        }
      }
    }

    const envFlag = this.options.env.FEATURE_FLAG_CHAT_AGENTIC_LOOP_V1;
    return envFlag === "1" || envFlag === "true";
  }

  private getAgenticLoopMaxSteps(
    metadata: Record<string, unknown> | undefined,
  ): number {
    const stepCandidate = metadata?.agenticLoopMaxSteps;
    if (typeof stepCandidate === "number" && Number.isInteger(stepCandidate)) {
      return Math.max(1, stepCandidate);
    }
    return DEFAULT_AGENTIC_LOOP_MAX_STEPS;
  }

  private getAgenticLoopTerminalStatus(
    stopReason: AgenticLoopStopReason,
  ): RunStatus {
    if (
      stopReason === "tool_error" ||
      stopReason === "budget_exceeded" ||
      stopReason === "cancelled"
    ) {
      return "FAILED";
    }
    return "COMPLETED";
  }

  private isReviewerPassEnabled(metadata?: Record<string, unknown>): boolean {
    if (!metadata) {
      return false;
    }

    const directFlag = metadata.reviewerPassV1;
    if (typeof directFlag === "boolean") {
      return directFlag;
    }

    const featureFlags = metadata.featureFlags;
    if (typeof featureFlags !== "object" || featureFlags === null) {
      return false;
    }

    const nestedFlag = (featureFlags as Record<string, unknown>).reviewerPassV1;
    return typeof nestedFlag === "boolean" ? nestedFlag : false;
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
