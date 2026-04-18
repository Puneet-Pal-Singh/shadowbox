import type { CoreMessage, CoreTool } from "ai";
import {
  RUN_WORKFLOW_STEPS,
  type RunEvent,
} from "@repo/shared-types";
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
import { AgenticLoopCancelledError } from "./AgenticLoop.js";
import { executeAgenticLoopTool } from "./AgenticLoopToolExecutor.js";
import { buildAgenticLoopWorkspaceContext } from "./RunContinuationContext.js";
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
import {
  PermissionApprovalStore,
} from "./PermissionApprovalStore.js";
import {
  getPermissionPolicyMessage,
  getWorkspaceBootstrapMessage,
  processPermissionDirectives as processPermissionDirectivesPolicy,
} from "./RunPermissionWorkspacePolicy.js";
import {
  createStreamResponse,
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
  buildAgenticLoopFinalMessage,
  getAgenticLoopMaxSteps,
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
import { resolveRunPermissionContext } from "./RunPermissionContextPolicy.js";
import { PermissionGateError } from "./PermissionGateError.js";
import { evaluateToolPermission } from "./RunRiskyActionPolicy.js";
import {
  buildApprovalDecisionMessage,
  extractApprovalDecision,
} from "./RunApprovalDecisionPolicy.js";
import { resetRecyclableRun } from "./RunRecyclableResetPolicy.js";
import { applyReviewerPassIfEnabled } from "./RunReviewerPassPolicy.js";
import { RunEventRecorder, RunEventRepository } from "../events/index.js";
import { getToolPresentation } from "../lib/ToolPresentation.js";
import { tryHandleTaskExecutionErrorPolicy } from "./RunTaskExecutionRecoveryPolicy.js";
import {
  ensureApprovalResolvedEventRecorded,
  waitForApprovalDecision,
} from "./RunApprovalWaitPolicy.js";
import {
  resolveBudgetConfig,
  resolveUnknownPricingMode,
} from "./RunEngineConfigPolicy.js";
import {
  handleExecutionErrorPolicy,
  safeMemoryOperation as safeMemoryOperationPolicy,
} from "./RunEngineReliabilityPolicy.js";

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
  userId?: string;
  correlationId: string;
  requestOrigin?: string;
}
export interface RunEngineEnv {
  COST_FAIL_ON_UNSEEDED_PRICING?: string;
  COST_UNKNOWN_PRICING_MODE?: string;
  MAX_RUN_BUDGET?: string;
  MAX_SESSION_BUDGET?: string;
  APPROVAL_WAIT_TIMEOUT_MS?: string;
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
        resolveUnknownPricingMode(options.env),
      );

    this.budgetManager =
      dependencies.budgetManager ??
      new BudgetManager(
        this.costTracker,
        this.pricingRegistry,
        resolveBudgetConfig(options.env),
        ctx,
      );
    this.sessionCostsLoaded = this.budgetManager.loadSessionCosts();

    this.aiService = dependencies.aiService;

    const pricingResolver =
      dependencies.pricingResolver ??
      new PricingResolver(this.pricingRegistry, {
        unknownPricingMode: resolveUnknownPricingMode(options.env),
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
      const effectiveInput = run.input;
      const runMode = run.metadata.manifest?.mode ?? "build";
      const approvalDecision = extractApprovalDecision(effectiveInput);

      if (approvalDecision) {
        const decisionResult = await this.permissionApprovalStore.resolveDecision(
          approvalDecision,
          run.metadata.actorUserId ?? this.options.userId,
        );
        await this.runEventRecorder.recordApprovalResolved({
          requestId: decisionResult.request.requestId,
          decision: decisionResult.decision,
          status:
            decisionResult.status === "approved"
              ? "approved"
              : decisionResult.status === "aborted"
                ? "aborted"
                : "denied",
        });
        recordLifecycleStep(
          run,
          "APPROVAL_WAIT",
          `approval decision resolved (${decisionResult.decision})`,
        );
        const decisionMessage = buildApprovalDecisionMessage(decisionResult);
        return await this.completeRunWithAssistantMessage(run, decisionMessage, {
          code: "APPROVAL_DECISION_RECORDED",
          requestId: decisionResult.request.requestId,
          decision: decisionResult.decision,
          status: decisionResult.status,
        });
      }

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
          effectiveInput.prompt,
          effectiveInput.repositoryContext,
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
          effectiveInput.prompt,
          effectiveInput.repositoryContext,
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
          effectiveInput,
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
          effectiveInput.prompt,
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
        executionNonce: run.createdAt.toISOString(),
      },
      this.llmGateway,
      this.taskExecutor,
    );
    const directExecutionService =
      this.agent instanceof BaseAgent
        ? this.agent.getRuntimeExecutionService()
        : undefined;
    let hasMutationEvidence = false;
    try {
      const loopResult = await loop.execute(messages, tools, {
        agentType: run.agentType,
        workspaceContext: buildAgenticLoopWorkspaceContext({
          repositoryContext: input.repositoryContext,
          prompt: input.prompt,
          continuation: run.metadata.continuation,
        }),
        isRunCancelled: async () => {
          const currentRun = await this.runRepo.getById(run.id);
          return currentRun?.status === "CANCELLED";
        },
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
              const permissionState =
                run.metadata.permissionContext?.state ??
                resolveRunPermissionContext(run.input).state;
              const permissionResult = await evaluateToolPermission({
                runId: run.id,
                sessionId: run.sessionId,
                origin: "agent",
                productMode: permissionState.productMode,
                workflowIntent: permissionState.workflowIntent,
                toolName: toolCall.toolName,
                toolArgs: toolCall.args,
                hasMutationEvidence,
                approvalStore: this.permissionApprovalStore,
              });
              if (permissionResult.kind === "ask") {
                recordLifecycleStep(
                  run,
                  "APPROVAL_WAIT",
                  "structured approval request emitted",
                );
                await this.runEventRecorder.recordApprovalRequested(
                  permissionResult.request,
                );
                const approvalOutcome = await waitForApprovalDecision({
                  request: permissionResult.request,
                  env: this.options.env,
                  runId: this.options.runId,
                  runRepo: this.runRepo,
                  permissionApprovalStore: this.permissionApprovalStore,
                });
                if (
                  approvalOutcome.outcome === "approved" ||
                  approvalOutcome.outcome === "denied" ||
                  approvalOutcome.outcome === "aborted"
                ) {
                  await ensureApprovalResolvedEventRecorded({
                    runEventRecorder: this.runEventRecorder,
                    requestId: permissionResult.request.requestId,
                    decision:
                      approvalOutcome.decision ??
                      (approvalOutcome.outcome === "approved"
                        ? "allow_once"
                        : approvalOutcome.outcome === "aborted"
                          ? "abort"
                          : "deny"),
                    status:
                      approvalOutcome.outcome === "approved"
                        ? "approved"
                        : approvalOutcome.outcome === "aborted"
                          ? "aborted"
                          : "denied",
                  });
                }
                if (approvalOutcome.outcome === "approved") {
                  // Continue with the original tool call after approval is granted.
                } else if (approvalOutcome.outcome === "timed_out") {
                  throw PermissionGateError.fromAsk(permissionResult.request);
                } else if (approvalOutcome.outcome === "cancelled") {
                  throw new AgenticLoopCancelledError(
                    "Run was cancelled while waiting for approval.",
                  );
                } else if (approvalOutcome.outcome === "aborted") {
                  throw PermissionGateError.fromDeny(
                    "Approval request was aborted.",
                  );
                } else {
                  throw PermissionGateError.fromDeny(
                    "Approval request was denied.",
                  );
                }
              }
              if (permissionResult.kind === "deny") {
                throw PermissionGateError.fromDeny(permissionResult.reason);
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
          if (!progress) return;
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
          if (toolCall.toolName === "write_file") hasMutationEvidence = true;
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
      if (loopResult.stopReason === "cancelled") {
        console.log(`[run/engine] Agentic loop observed cancellation for run ${run.id}`);
        return createStreamResponse("");
      }
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
      if (error instanceof PermissionGateError) {
        const gateResult = error.gateResult;
        if (gateResult.kind === "ask") {
          return this.completeRunWithAssistantMessage(run, error.message, {
            code: "APPROVAL_REQUIRED",
            approvalRequest: gateResult.request,
          });
        }
        const currentRun = await this.runRepo.getById(run.id);
        if (currentRun?.status === "CANCELLED") {
          console.log(`[run/engine] Returning empty response for cancelled run ${run.id}`);
          return createStreamResponse("");
        }
        const denialReason =
          gateResult.kind === "deny" ? gateResult.reason : error.message;
        return this.completeRunWithAssistantMessage(run, error.message, {
          code: "PERMISSION_DENIED",
          reason: denialReason,
        });
      }
      const recoveryResponse = await this.tryHandleTaskExecutionError(
        run,
        run.input.prompt,
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
    const previousStatus = run.status;
    run.transition("CANCELLED");
    recordLifecycleStep(run, "TERMINAL", "status=CANCELLED");
    recordOrchestrationTerminal(run);
    await this.runRepo.update(run);
    await this.runEventRecorder.recordRunStatusChanged(
      previousStatus,
      run.status,
      RUN_WORKFLOW_STEPS.EXECUTION,
      "user_cancelled",
    );
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
        const resetRun = await resetRecyclableRun({
          runId,
          sessionId,
          input,
          previousStatus: existing.status,
          existingRun: existing,
          taskRepo: this.taskRepo,
          runRepo: this.runRepo,
          createFreshRun: this.createFreshRun.bind(this),
        });
        await this.runEventRecorder.clear();
        return resetRun;
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
        actorUserId: this.options.userId,
        manifest,
        permissionContext: resolveRunPermissionContext(input),
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

  private async processPermissionDirectives(prompt: string): Promise<string | null> {
    return processPermissionDirectivesPolicy(prompt, this.permissionApprovalStore);
  }

  private async getPermissionPolicyMessage(prompt: string, repositoryContext?: RepositoryContext): Promise<string | null> {
    return getPermissionPolicyMessage(prompt, repositoryContext, this.permissionApprovalStore);
  }
  private async getWorkspaceBootstrapMessage(
    runId: string,
    prompt: string,
    repositoryContext?: RepositoryContext,
  ): Promise<string | null> {
    return getWorkspaceBootstrapMessage(runId, prompt, repositoryContext, this.workspaceBootstrapper);
  }
  private async handleExecutionError(
    runId: string,
    error: unknown,
  ): Promise<void> {
    await handleExecutionErrorPolicy({
      runId,
      error,
      runRepo: this.runRepo,
      runEventRecorder: this.runEventRecorder,
      getRunDurationMs: this.getRunDurationMs.bind(this),
    });
  }

  private async safeMemoryOperation<T>(
    operation: () => Promise<T>,
  ): Promise<T | undefined> {
    return safeMemoryOperationPolicy(operation);
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
    return tryHandleTaskExecutionErrorPolicy({
      run,
      prompt,
      loop,
      error,
      deps: {
        completeRunWithRecoveredAssistantMessage:
          this.completeRunWithRecoveredAssistantMessage.bind(this),
        runEventRecorder: this.runEventRecorder,
      },
    });
  }

}
export class RunEngineError extends Error {
  constructor(message: string) {
    super(`[run/engine] ${message}`);
    this.name = "RunEngineError";
  }
}
