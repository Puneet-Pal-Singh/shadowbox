/**
 * AgenticLoop - Bounded agentic tool-chaining loop
 *
 * Implements Track 3: Bounded Agentic Loop
 * Executes tools inline and feeds results back to LLM for further action
 */

import type { CoreMessage, CoreTool } from "ai";
import {
  safeParseToolActivityMetadata,
  type ToolActivityMetadata,
} from "@repo/shared-types";
import {
  BudgetExceededError,
  SessionBudgetExceededError,
} from "../cost/index.js";
import {
  LLMUnusableResponseError,
  type ILLMGateway,
} from "../llm/index.js";
import type { IBudgetManager } from "../cost/index.js";
import type { TaskExecutor } from "../orchestration/index.js";
import { isMutatingGoldenFlowToolName } from "../contracts/CodingToolGateway.js";
import { Task } from "../task/index.js";
import type {
  AgenticLoopTerminalLlmIssue,
  AgenticLoopToolLifecycleEvent,
  TaskResult,
} from "../types.js";
import { detectsMutation } from "./detectsMutation.js";

export interface AgenticLoopConfig {
  maxSteps: number;
  runId: string;
  sessionId: string;
  budget?: IBudgetManager;
}

interface AgenticLoopToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface AgenticLoopToolResult {
  toolId: string;
  toolName: string;
  result: unknown;
  error?: string;
  terminalError?: boolean;
}

export type StopReason =
  | "max_steps_reached"
  | "budget_exceeded"
  | "llm_stop"
  | "incomplete_mutation"
  | "tool_error"
  | "cancelled";

export interface AgenticLoopResult {
  stopReason: StopReason;
  messages: CoreMessage[];
  toolExecutionCount: number;
  failedToolCount: number;
  stepsExecuted: number;
  requiresMutation: boolean;
  completedMutatingToolCount: number;
  completedReadOnlyToolCount: number;
  llmRetryCount?: number;
  terminalLlmIssue?: AgenticLoopTerminalLlmIssue;
  toolLifecycle: AgenticLoopToolLifecycleEvent[];
}

interface AgenticLoopHooks {
  workspaceContext?: string;
  executeTool?: (toolCall: AgenticLoopToolCall) => Promise<TaskResult>;
  onAssistantMessage?: (content: string) => Promise<void>;
  onProgress?: (
    progress:
      | {
          phase: "planning" | "execution" | "synthesis";
          label: string;
          summary: string;
          status: "active" | "completed";
        }
      | null,
  ) => Promise<void>;
  onToolRequested?: (toolCall: AgenticLoopToolCall) => Promise<void>;
  onToolStarted?: (toolCall: AgenticLoopToolCall) => Promise<void>;
  onToolCompleted?: (
    toolCall: AgenticLoopToolCall,
    result: unknown,
    executionTimeMs: number,
  ) => Promise<void>;
  onToolFailed?: (
    toolCall: AgenticLoopToolCall,
    error: string,
    executionTimeMs: number,
  ) => Promise<void>;
}

/**
 * AgenticLoop executes a bounded loop of LLM calls and tool execution
 * with explicit stop conditions and budget enforcement
 */
export class AgenticLoop {
  private readonly config: AgenticLoopConfig;
  private readonly llmGateway: ILLMGateway;
  private readonly executor: TaskExecutor;
  private stepsExecuted: number = 0;
  private toolExecutionCount: number = 0;
  private failedToolCount: number = 0;
  private completedMutatingToolCount: number = 0;
  private completedReadOnlyToolCount: number = 0;
  private llmRetryCount: number = 0;
  private terminalLlmIssue?: AgenticLoopTerminalLlmIssue;
  private toolLifecycle: AgenticLoopToolLifecycleEvent[] = [];

  constructor(
    config: AgenticLoopConfig,
    llmGateway: ILLMGateway,
    executor: TaskExecutor,
  ) {
    if (config.maxSteps < 1) {
      throw new Error("maxSteps must be >= 1");
    }
    this.config = config;
    this.llmGateway = llmGateway;
    this.executor = executor;
  }

  /**
   * Execute the agentic loop
   * Returns result with explicit stop reason
   */
  async execute(
    initialMessages: CoreMessage[],
    tools: Record<string, CoreTool>,
    context: {
      agentType: string;
      modelId?: string;
      providerId?: string;
      temperature?: number;
    } & AgenticLoopHooks,
  ): Promise<AgenticLoopResult> {
    this.reset();
    const messages: CoreMessage[] = [...initialMessages];
    const requiresMutation = requestRequiresMutation(initialMessages);
    let stopReason: StopReason | null = null;
    let correctiveMutationRetryIssued = false;

    for (let step = 0; step < this.config.maxSteps; step++) {
      this.stepsExecuted = step + 1;
      const isFinalSynthesisStep =
        step === this.config.maxSteps - 1 && this.toolExecutionCount > 0;

      // Check budget before LLM call
      try {
        if (await this.isRunOverBudget()) {
          throw new BudgetExceededError(this.config.runId, 0, 0);
        }
      } catch (error) {
        if (
          error instanceof BudgetExceededError ||
          error instanceof SessionBudgetExceededError
        ) {
          console.warn(
            `[agentic-loop] Budget exceeded at step ${step} for run ${this.config.runId}`,
          );
          stopReason = "budget_exceeded";
          break;
        }
        throw error;
      }

      console.log(
        `[agentic-loop] Step ${step + 1}/${this.config.maxSteps} for run ${this.config.runId}`,
      );

      const progress = buildLoopProgressUpdate({
        isFinalSynthesisStep,
        requiresMutation,
        completedMutatingToolCount: this.completedMutatingToolCount,
        completedReadOnlyToolCount: this.completedReadOnlyToolCount,
      });
      if (progress) {
        await context.onProgress?.(progress);
      }

      // Call LLM with tool definitions for this step.
      let response;
      try {
        response = await this.generateLoopText(
          {
            context: {
              runId: this.config.runId,
              sessionId: this.config.sessionId,
              agentType: context.agentType,
              phase: "task",
            },
            messages,
            system: buildAgenticLoopSystemPrompt({
              workspaceContext: context.workspaceContext,
              finalSynthesisOnly: isFinalSynthesisStep,
              requiresMutation,
              completedMutatingToolCount: this.completedMutatingToolCount,
              completedReadOnlyToolCount: this.completedReadOnlyToolCount,
              correctiveRetryRequested: correctiveMutationRetryIssued,
            }),
            tools: isFinalSynthesisStep ? undefined : tools,
            model: context.modelId,
            providerId: context.providerId,
            temperature: context.temperature,
          },
          step,
        );
      } catch (error) {
        console.error(`[agentic-loop] LLM call failed at step ${step}:`, error);
        throw error;
      }

      // Add LLM response to messages
      messages.push(buildAssistantMessage(response.text, response.toolCalls));
      if (response.toolCalls && response.toolCalls.length > 0) {
        await context.onAssistantMessage?.(response.text);
      }

      // Check if LLM requested tool calls
      if (!response.toolCalls || response.toolCalls.length === 0) {
        console.log(
          `[agentic-loop] LLM finished (no tool calls) at step ${step}`,
        );
        if (
          !requiresMutation ||
          this.completedMutatingToolCount > 0 ||
          isFinalSynthesisStep
        ) {
          stopReason =
            requiresMutation && this.completedMutatingToolCount === 0
              ? "incomplete_mutation"
              : "llm_stop";
          break;
        }

        const isOverBudget = await this.isRunOverBudget();
        if (isOverBudget || correctiveMutationRetryIssued) {
          await context.onProgress?.({
            phase: "execution",
            label: "Run incomplete",
            summary:
              "No file changed before the run stopped, so the edit remains incomplete.",
            status: "completed",
          });
          stopReason = "incomplete_mutation";
          break;
        }

        correctiveMutationRetryIssued = true;
        await context.onProgress?.({
          phase: "execution",
          label: "Corrective retry",
          summary:
            "No file changed yet. Requesting one concrete mutation before ending the run.",
          status: "active",
        });
        continue;
      }

      // Execute requested tools
      const toolResults: AgenticLoopToolResult[] = [];

      for (const toolCall of response.toolCalls) {
        this.toolExecutionCount++;
        this.recordToolLifecycle(toolCall, "requested");
        await context.onToolRequested?.(toolCall);

        // Check budget before tool execution
        try {
          if (await this.isRunOverBudget()) {
            throw new BudgetExceededError(this.config.runId, 0, 0);
          }
        } catch (error) {
          if (
            error instanceof BudgetExceededError ||
            error instanceof SessionBudgetExceededError
          ) {
            console.warn(
              `[agentic-loop] Budget exceeded during tool execution for run ${this.config.runId}`,
            );
            stopReason = "budget_exceeded";
            break;
          }
          throw error;
        }

        // Execute tool
        try {
          if (!tools[toolCall.toolName]) {
            this.failedToolCount++;
            const message = `Tool "${toolCall.toolName}" is not registered for this run`;
            console.warn(`[agentic-loop] ${message} (call: ${toolCall.id})`);
            this.recordToolLifecycle(toolCall, "failed", message);
            await context.onToolFailed?.(toolCall, message, 0);
            toolResults.push({
              toolId: toolCall.id,
              toolName: toolCall.toolName,
              result: null,
              error: message,
              terminalError: true,
            });
            continue;
          }

          console.log(
            `[agentic-loop] Executing tool: ${toolCall.toolName} (call: ${toolCall.id})`,
          );

          const toolStartedAt = Date.now();
          this.recordToolLifecycle(toolCall, "started");
          await context.onToolStarted?.(toolCall);
          const result = context.executeTool
            ? await context.executeTool(toolCall)
            : await this.executor.execute(
                this.createToolTask(toolCall.id, toolCall),
              );
          const executionTimeMs = Date.now() - toolStartedAt;

          if (result.status === "DONE") {
            if (isMutatingGoldenFlowToolName(toolCall.toolName)) {
              this.completedMutatingToolCount++;
            } else {
              this.completedReadOnlyToolCount++;
            }
            this.recordToolLifecycle(
              toolCall,
              "completed",
              summarizeLifecycleDetail(result.output?.content ?? null),
              extractToolActivityMetadata(result.output?.metadata),
            );
            await context.onToolCompleted?.(
              toolCall,
              result.output ?? null,
              executionTimeMs,
            );
            toolResults.push({
              toolId: toolCall.id,
              toolName: toolCall.toolName,
              result: result.output ?? null,
            });
          } else {
            this.failedToolCount++;
            const toolError = result.error?.message || "Tool execution failed";
            this.recordToolLifecycle(toolCall, "failed", toolError);
            await context.onToolFailed?.(toolCall, toolError, executionTimeMs);
            toolResults.push({
              toolId: toolCall.id,
              toolName: toolCall.toolName,
              result: null,
              error: toolError,
              terminalError: isTerminalToolFailure(toolCall.toolName),
            });
          }
        } catch (error) {
          this.failedToolCount++;
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          const executionTimeMs = 0;
          this.recordToolLifecycle(toolCall, "failed", errorMessage);
          await context.onToolFailed?.(toolCall, errorMessage, executionTimeMs);
          console.error(
            `[agentic-loop] Tool execution failed: ${toolCall.toolName}`,
            error,
          );
          toolResults.push({
            toolId: toolCall.id,
            toolName: toolCall.toolName,
            result: null,
            error: errorMessage,
            terminalError: isTerminalToolFailure(toolCall.toolName),
          });
        }
      }

      // If budget exceeded during tool execution, stop loop
      if (stopReason === "budget_exceeded") {
        break;
      }

      // Add tool results to messages for next LLM call
      if (toolResults.length > 0) {
        messages.push(buildToolResultMessage(toolResults));
      }

      if (toolResults.some((result) => result.terminalError)) {
        stopReason = "tool_error";
        break;
      }
    }

    if (!stopReason) {
      console.log(
        `[agentic-loop] Max steps reached (${this.config.maxSteps}) for run ${this.config.runId}`,
      );
      stopReason = "max_steps_reached";
    }

    console.log(
      `[agentic-loop] Finished for run ${this.config.runId}: stopReason=${stopReason}, steps=${this.stepsExecuted}, tools=${this.toolExecutionCount}`,
    );

    return {
      stopReason,
      messages,
      toolExecutionCount: this.toolExecutionCount,
      failedToolCount: this.failedToolCount,
      stepsExecuted: this.stepsExecuted,
      requiresMutation,
      completedMutatingToolCount: this.completedMutatingToolCount,
      completedReadOnlyToolCount: this.completedReadOnlyToolCount,
      llmRetryCount: this.llmRetryCount,
      terminalLlmIssue: this.terminalLlmIssue,
      toolLifecycle: [...this.toolLifecycle],
    };
  }

  /**
   * Get current loop statistics
   */
  getStats() {
    return {
      stepsExecuted: this.stepsExecuted,
      toolExecutionCount: this.toolExecutionCount,
      failedToolCount: this.failedToolCount,
      toolLifecycleCount: this.toolLifecycle.length,
      completedMutatingToolCount: this.completedMutatingToolCount,
      completedReadOnlyToolCount: this.completedReadOnlyToolCount,
      llmRetryCount: this.llmRetryCount,
      terminalLlmIssue: this.terminalLlmIssue,
      toolLifecycle: [...this.toolLifecycle],
      maxSteps: this.config.maxSteps,
    };
  }

  /**
   * Reset counters (for testing)
   */
  reset() {
    this.stepsExecuted = 0;
    this.toolExecutionCount = 0;
    this.failedToolCount = 0;
    this.completedMutatingToolCount = 0;
    this.completedReadOnlyToolCount = 0;
    this.llmRetryCount = 0;
    this.terminalLlmIssue = undefined;
    this.toolLifecycle = [];
  }

  private async generateLoopText(
    request: Parameters<ILLMGateway["generateText"]>[0],
    step: number,
  ): ReturnType<ILLMGateway["generateText"]> {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.llmGateway.generateText({
          ...request,
          context: {
            ...request.context,
            idempotencyKey: buildAgenticLoopTextAttemptIdempotencyKey(
              this.config.runId,
              step,
              attempt,
            ),
          },
        });
      } catch (error) {
        if (!(error instanceof LLMUnusableResponseError)) {
          throw error;
        }

        if (attempt >= maxAttempts) {
          this.terminalLlmIssue = {
            type: "unusable_response",
            providerId: error.providerId,
            modelId: error.modelId,
            anomalyCode: error.anomalyCode,
            finishReason: error.finishReason,
            statusCode: error.statusCode,
            attempts: attempt,
          };
          console.warn(
            `[agentic-loop] Unusable LLM response exhausted retry for run ${this.config.runId}`,
            this.terminalLlmIssue,
          );
          throw error;
        }

        this.llmRetryCount++;
        console.warn(
          `[agentic-loop] Unusable LLM response for run ${this.config.runId}; retrying once`,
          {
            providerId: error.providerId,
            modelId: error.modelId,
            anomalyCode: error.anomalyCode,
            finishReason: error.finishReason,
            statusCode: error.statusCode,
          },
        );
      }
    }

    throw new Error("[agentic-loop] unreachable LLM retry state");
  }

  private createToolTask(
    id: string,
    toolCall: Pick<AgenticLoopToolCall, "toolName" | "args">,
  ): Task {
    return new Task(id, this.config.runId, toolCall.toolName, "PENDING", [], {
      description: `Execute ${toolCall.toolName}`,
      ...toolCall.args,
    });
  }

  private recordToolLifecycle(
    toolCall: Pick<AgenticLoopToolCall, "id" | "toolName">,
    status: AgenticLoopToolLifecycleEvent["status"],
    detail?: string,
    metadata?: ToolActivityMetadata,
  ): void {
    this.toolLifecycle.push({
      toolCallId: toolCall.id,
      toolName: toolCall.toolName,
      status,
      mutating: isMutatingGoldenFlowToolName(toolCall.toolName),
      recordedAt: new Date().toISOString(),
      detail,
      metadata,
    });
  }

  private async isRunOverBudget(): Promise<boolean> {
    if (!this.config.budget) {
      return false;
    }

    try {
      return await this.config.budget.isOverBudget(this.config.runId);
    } catch (error) {
      if (
        error instanceof BudgetExceededError ||
        error instanceof SessionBudgetExceededError
      ) {
        return true;
      }
      throw error;
    }
  }
}

function buildAgenticLoopSystemPrompt(input: {
  workspaceContext?: string;
  finalSynthesisOnly: boolean;
  requiresMutation: boolean;
  completedMutatingToolCount: number;
  completedReadOnlyToolCount: number;
  correctiveRetryRequested: boolean;
}): string {
  const sections = [
    "You are Shadowbox's autonomous build agent.",
    "Your job is to inspect the real workspace, decide which tools to use, and answer the user's request in clear natural language.",
    "Start with the real workspace before concluding anything. Never invent file contents, project structure, git state, or completed work.",
    "Tool strategy:",
    "- For concrete git commands such as git status, git switch, or git branch, you may use bash so the terminal transcript stays intact.",
    "- For repository or git status questions without a specific command, use git_status before answering.",
    "- For vague component, page, route, or file questions, discover with list_files, glob, or grep before read_file.",
    "- Prefer narrowing search after one broad listing. Do not repeat the same missing path after a file-not-found error.",
    "- If a non-mutating tool returns no match or not found, keep exploring with different tools or paths instead of stopping.",
    "- If a mutating tool fails, stop and explain what failed.",
    "Answer quality:",
    "- After gathering enough evidence, answer the user directly in plain English.",
    "- Summarize tool results instead of echoing raw JSON or raw telemetry.",
    "- Reference the files or git facts you actually observed.",
  ];

  if (input.requiresMutation) {
    sections.push(
      [
        "Editing rule:",
        "- The user asked you to change the workspace, not only inspect it.",
        "- Do not claim success until a mutating tool such as write_file has completed successfully.",
        "- After enough inspection, choose the best concrete file and make the change.",
      ].join("\n"),
    );
  }

  if (input.workspaceContext) {
    sections.push(`Workspace context:\n${input.workspaceContext}`);
  }

  if (
    input.requiresMutation &&
    input.completedMutatingToolCount === 0 &&
    input.completedReadOnlyToolCount >= 4
  ) {
    sections.push(
      [
        "Progress correction:",
        "- You have already used several read-only tools without making the requested change.",
        "- Stop broad inspection and attempt the concrete edit now unless the target is still genuinely unknown.",
        "- If you still cannot identify the right file, say that explicitly in the final answer instead of claiming completion.",
      ].join("\n"),
    );
  }

  if (input.correctiveRetryRequested) {
    sections.push(
      [
        "Corrective retry:",
        "- The last response stopped without changing any files.",
        "- You must now either call a concrete mutating tool or clearly admit that no file was changed.",
        "- Do not end with a success claim unless a mutating tool succeeds in this run.",
      ].join("\n"),
    );
  }

  if (input.finalSynthesisOnly) {
    const finalStepRules = [
      "Final step rule:",
      "- This is the final step. Do not call tools.",
      "- Synthesize what you have already learned into the best truthful answer you can.",
      "- If the task is incomplete, say what you checked, what you found, and what remains uncertain.",
    ];

    if (input.requiresMutation && input.completedMutatingToolCount === 0) {
      finalStepRules.push(
        "- The requested change is not complete because no mutating tool succeeded.",
      );
      finalStepRules.push(
        "- Do not claim that files were updated or improved unless a mutating tool actually succeeded.",
      );
    }

    sections.push(finalStepRules.join("\n"));
  }

  return sections.join("\n");
}

function buildAgenticLoopTextAttemptIdempotencyKey(
  runId: string,
  step: number,
  attempt: number,
): string {
  return `agentic-loop:${runId}:step:${step + 1}:attempt:${attempt}`;
}

function isTerminalToolFailure(toolName: string): boolean {
  return isMutatingGoldenFlowToolName(toolName);
}

function buildAssistantMessage(
  text: string,
  toolCalls: AgenticLoopToolCall[] | undefined,
): CoreMessage {
  const normalizedText = normalizeAssistantText(text, toolCalls);
  if (!toolCalls || toolCalls.length === 0) {
    return {
      role: "assistant",
      content: normalizedText,
    };
  }

  const content: Array<
    | { type: "text"; text: string }
    | {
        type: "tool-call";
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
      }
  > = [];

  if (normalizedText.trim()) {
    content.push({
      type: "text",
      text: normalizedText,
    });
  }

  for (const toolCall of toolCalls) {
    content.push({
      type: "tool-call",
      toolCallId: toolCall.id,
      toolName: toolCall.toolName,
      args: toolCall.args,
    });
  }

  return {
    role: "assistant",
    content,
  };
}

function buildToolResultMessage(
  toolResults: AgenticLoopToolResult[],
): CoreMessage {
  return {
    role: "tool",
    content: toolResults.map((result) => ({
      type: "tool-result" as const,
      toolCallId: result.toolId,
      toolName: result.toolName,
      result: result.error ? { error: result.error } : result.result,
      isError: Boolean(result.error),
    })),
  };
}

function summarizeLifecycleDetail(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const raw =
    typeof value === "string"
      ? value
      : (JSON.stringify(value, null, 2) ?? String(value));
  const normalized = raw.trim();
  if (!normalized) {
    return undefined;
  }

  const compact = normalized.replace(/\s+/g, " ");
  return compact.length <= 160 ? compact : `${compact.slice(0, 157)}...`;
}

function extractToolActivityMetadata(
  metadata: unknown,
): ToolActivityMetadata | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const activity = (metadata as Record<string, unknown>).activity;
  const parsed = safeParseToolActivityMetadata(activity);
  return parsed.success ? parsed.data : undefined;
}

function requestRequiresMutation(initialMessages: CoreMessage[]): boolean {
  const userText = initialMessages
    .filter((message) => message.role === "user")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .filter(
                (
                  part,
                ): part is {
                  type: "text";
                  text: string;
                } => part.type === "text" && typeof part.text === "string",
              )
              .map((part) => part.text)
              .join("\n")
          : "",
    )
    .join("\n")
    .toLowerCase();

  return detectsMutation(userText);
}

function normalizeAssistantText(
  text: string,
  toolCalls: AgenticLoopToolCall[] | undefined,
): string {
  const trimmed = text.trim();
  if (!toolCalls || toolCalls.length === 0 || !trimmed) {
    return normalizeStandaloneToolCallMarkup(text);
  }

  return normalizeStandaloneToolCallMarkup(text);
}

function normalizeStandaloneToolCallMarkup(text: string): string {
  const trimmed = text.trim();
  if (/^<tool_call>[\s\S]*<\/tool_call>$/i.test(trimmed)) {
    return "";
  }

  return text;
}

function buildLoopProgressUpdate(input: {
  isFinalSynthesisStep: boolean;
  requiresMutation: boolean;
  completedMutatingToolCount: number;
  completedReadOnlyToolCount: number;
}):
  | {
      phase: "planning" | "execution" | "synthesis";
      label: string;
      summary: string;
      status: "active" | "completed";
    }
  | null {
  if (input.isFinalSynthesisStep) {
    return null;
  }

  if (
    input.requiresMutation &&
    input.completedMutatingToolCount === 0 &&
    input.completedReadOnlyToolCount > 0
  ) {
    return {
      phase: "execution",
      label: "Thinking",
      summary: "",
      status: "active",
    };
  }

  return {
    phase: "execution",
    label: "Thinking",
    summary: "",
    status: "active",
  };
}
