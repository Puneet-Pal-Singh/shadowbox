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
import { RoutingDetector } from "../lib/RoutingDetector.js";
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
    const taskExecutor = agent
      ? new AgentTaskExecutor(
          agent,
          options.runId,
          options.sessionId,
          this.taskRepo,
          this.runRepo,
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
      );

      await this.safeMemoryOperation(() =>
        this.persistConversationMessages(runId, sessionId, messages, "user"),
      );

      const approvalDirectiveMessage = await this.processPermissionDirectives(
        input.prompt,
      );
      if (approvalDirectiveMessage) {
        console.log(
          `[run/engine] Permission directive processed for run ${runId}`,
        );
        return await this.completeRunWithAssistantMessage(
          run,
          approvalDirectiveMessage,
        );
      }

      const bypassPlanning = this.shouldBypassPlanning(input.prompt);
      if (bypassPlanning) {
        console.log(`[run/engine] Conversational bypass for run ${runId}`);
        return await this.executeConversationalTurn(run, input, messages);
      }

      const clarificationMessage = this.getActionClarificationMessage(
        input.prompt,
        input.repositoryContext,
      );
      if (clarificationMessage) {
        console.log(
          `[run/engine] Clarification required before action planning for run ${runId}`,
        );
        return await this.completeRunWithAssistantMessage(
          run,
          clarificationMessage,
        );
      }

      const permissionMessage = await this.getPermissionPolicyMessage(
        input.prompt,
        input.repositoryContext,
      );
      if (permissionMessage) {
        console.log(
          `[run/engine] Permission check blocked action planning for run ${runId}`,
        );
        return await this.completeRunWithAssistantMessage(run, permissionMessage);
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
        this.transitionRunToFailed(run, runId);
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
      const finalRunStatus = this.determineRunStatusFromTasks(allTasks);
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
      const finalOutputRaw = await this.generateSynthesis(
        run,
        input.prompt,
        this.currentMemoryContext,
      );
      const finalOutput = this.sanitizeUserFacingOutput(finalOutputRaw);

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

      this.applyFinalRunStatus(run, runId, finalRunStatus, allTasks);
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
      system: this.buildConversationalSystemPrompt(),
      model: input.modelId,
      providerId: input.providerId,
      temperature: 0.7,
    });
    return this.completeRunWithAssistantMessage(run, result.text);
  }

  private shouldBypassPlanning(prompt: string): boolean {
    const decision = RoutingDetector.analyze(prompt);
    console.log(
      `[run/engine] Routing decision: bypass=${decision.bypass}, intent=${decision.intent}, reason="${decision.reason}"`,
    );
    return decision.bypass;
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
    const safeContent = this.sanitizeUserFacingOutput(content);
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

  private buildConversationalSystemPrompt(): string {
    const nowIso = new Date().toISOString();
    return [
      "You are Shadowbox assistant in conversational chat mode.",
      "Answer the user directly in the first sentence, then add brief helpful details.",
      "Use a natural, friendly tone. Avoid robotic report phrasing.",
      'Do not start with phrases like "Based on the analysis", "The system", or "Based on completed tasks".',
      "Treat casual prompts as normal conversation.",
      "If asked about capabilities, answer in plain language about what you can help with.",
      "Do not fabricate tool execution, file access, command output, or repository inspection.",
      "Do not claim you analyzed files unless the user explicitly asked for file/repo operations in this turn.",
      "Do not mention internal run IDs, internal URLs, filesystem paths, or debug traces.",
      `Current runtime timestamp (UTC): ${nowIso}. If asked for date/time, use this timestamp as reference.`,
      "If the user asks about capabilities, describe what you can help with conversationally and ask for explicit permission/request before operational actions.",
    ].join("\n");
  }

  private async completeRunWithAssistantMessage(
    run: Run,
    text: string,
  ): Promise<Response> {
    const sanitizedText = this.sanitizeUserFacingOutput(text);

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

    this.transitionRunToCompleted(run, run.id);
    run.output = { content: sanitizedText };
    await this.runRepo.update(run);
    console.log(`[run/engine] Completed conversational run ${run.id}`);

    return this.createStreamResponse(sanitizedText);
  }

  private getActionClarificationMessage(
    prompt: string,
    repositoryContext?: RepositoryContext,
  ): string | null {
    const normalized = prompt.toLowerCase().trim();
    const asksForRepoOrFileAction =
      /\b(read|check|view|open|analyze|inspect|review|edit|update|fix|search|find)\b/.test(
        normalized,
      ) &&
      /\b(file|files|document|doc|readme|code|repo|repository|branch)\b/.test(
        normalized,
      );

    if (asksForRepoOrFileAction && !this.hasRepositorySelection(repositoryContext)) {
      return "Sure. I can help with that, but I need you to select a repository first. Then share the file path if you want file-level analysis.";
    }
    return null;
  }

  private hasRepositorySelection(repositoryContext?: RepositoryContext): boolean {
    return Boolean(
      repositoryContext?.owner?.trim() && repositoryContext.repo?.trim(),
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

    if (!this.hasRepositorySelection(repositoryContext)) {
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

  private sanitizeUserFacingOutput(text: string): string {
    return text
      .replace(
        /\/home\/sandbox\/runs\/(?:\[run\]|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[^\s"']+/gi,
        "the workspace file",
      )
      .replace(
        /\/home\/sandbox\/runs\/(?:\[run\]|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
        "the workspace directory",
      )
      .replace(
        /(?:error:\s*)?cat:\s*(?:the workspace file|\[workspace-file\])\s*:?\s*no such file or directory/gi,
        "The requested file was not found in the current workspace.",
      )
      .replace(
        /(?:error:\s*)?cat:\s*(?:the workspace file|\[workspace-file\])\s*:?\s*is a directory/gi,
        "The requested path is a directory. Please provide a file path.",
      )
      .replace(/http:\/\/internal(?:\/[^\s"']*)?/gi, "[internal-url]");
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
        this.transitionRunToFailed(run, runId);
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

  private transitionRunToCompleted(run: Run, runId: string): void {
    if (run.status === "COMPLETED") {
      return;
    }

    if (run.status === "FAILED" || run.status === "CANCELLED") {
      console.warn(
        `[run/engine] Skipping COMPLETED transition for run ${runId}; current status is ${run.status}`,
      );
      return;
    }

    this.ensureRunReadyForTerminalTransition(run);
    if (run.status === "RUNNING") {
      run.transition("COMPLETED");
    }
  }

  private transitionRunToFailed(run: Run, runId: string): void {
    if (run.status === "FAILED" || run.status === "CANCELLED") {
      return;
    }

    if (run.status === "COMPLETED") {
      console.warn(
        `[run/engine] Preserving COMPLETED state for run ${runId} after post-completion error`,
      );
      return;
    }

    this.ensureRunReadyForTerminalTransition(run);
    if (run.status === "RUNNING") {
      run.transition("FAILED");
      return;
    }

    console.warn(
      `[run/engine] Unable to move run ${runId} to FAILED from status ${run.status}`,
    );
  }

  private determineRunStatusFromTasks(tasks: Task[]): RunStatus {
    if (tasks.some((task) => task.status === "CANCELLED")) {
      return "CANCELLED";
    }
    if (tasks.some((task) => task.status === "FAILED")) {
      return "FAILED";
    }
    return "COMPLETED";
  }

  private applyFinalRunStatus(
    run: Run,
    runId: string,
    finalRunStatus: RunStatus,
    tasks: Task[],
  ): void {
    if (finalRunStatus === "COMPLETED") {
      this.transitionRunToCompleted(run, runId);
      return;
    }

    if (finalRunStatus === "FAILED") {
      this.transitionRunToFailed(run, runId);
      const failedTasks = tasks.filter((task) => task.status === "FAILED");
      const summary = failedTasks
        .map((task) => `${task.id}: ${task.error?.message ?? "Task failed"}`)
        .join("; ");
      run.metadata.error = summary || "One or more tasks failed";
      return;
    }

    if (run.status === "FAILED" || run.status === "COMPLETED") {
      return;
    }

    this.ensureRunReadyForTerminalTransition(run);
    if (run.status === "RUNNING") {
      run.transition("CANCELLED");
    }
  }

  private ensureRunReadyForTerminalTransition(run: Run): void {
    if (
      run.status === "CREATED" ||
      run.status === "PLANNING" ||
      run.status === "PAUSED"
    ) {
      run.transition("RUNNING");
    }
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
