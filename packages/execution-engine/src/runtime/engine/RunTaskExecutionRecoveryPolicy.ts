import { RUN_WORKFLOW_STEPS } from "@repo/shared-types";
import type { Run } from "../run/index.js";
import type { RunEventRecorder } from "../events/index.js";
import {
  LLMTimeoutError,
  LLMUnusableResponseError,
} from "../llm/LLMGateway.js";
import type { AgenticLoop } from "./AgenticLoop.js";
import { detectsMutation } from "./detectsMutation.js";
import {
  buildTaskModelNoActionMetadata,
  buildTaskModelNoActionSummary,
  recordRecoveredAgenticLoopMetadata,
} from "./RunAgenticLoopPolicy.js";

interface TaskExecutionRecoveryDependencies {
  completeRunWithRecoveredAssistantMessage: (
    run: Run,
    text: string,
    metadata?: Record<string, unknown>,
    errorMetadata?: string,
  ) => Promise<Response>;
  runEventRecorder: Pick<RunEventRecorder, "recordRunProgress">;
}

interface TaskExecutionRecoveryInput {
  run: Run;
  prompt: string;
  loop: AgenticLoop;
  error: unknown;
  deps: TaskExecutionRecoveryDependencies;
}

interface TaskExecutionRecoveryContext {
  stats: ReturnType<AgenticLoop["getStats"]>;
  requiresMutation: boolean;
}

export async function tryHandleTaskExecutionErrorPolicy(
  input: TaskExecutionRecoveryInput,
): Promise<Response | null> {
  const { error } = input;

  if (isTaskExecutionTimeout(error)) {
    return handleTaskTimeoutRecovery(input);
  }

  if (isTaskExecutionUnusableResponse(error)) {
    return handleUnusableResponseRecovery(input, error);
  }

  return null;
}

async function handleTaskTimeoutRecovery(
  input: Pick<
    TaskExecutionRecoveryInput,
    "run" | "prompt" | "loop" | "deps" | "error"
  >,
): Promise<Response> {
  const { run, deps } = input;
  const context = buildTaskExecutionRecoveryContext(input);
  const timeoutDetails = buildTaskTimeoutDetails(input.run, input.error, context);
  const text = buildTaskExecutionTimeoutMessage({
    requiresMutation: context.requiresMutation,
    noFileChanged:
      !context.requiresMutation ||
      context.stats.completedMutatingToolCount === 0,
    toolExecutionCount: context.stats.toolExecutionCount,
    stepsExecuted: context.stats.stepsExecuted,
    timeoutMs: timeoutDetails.timeoutMs,
    providerId: timeoutDetails.providerId,
    modelId: timeoutDetails.modelId,
    lastCompletedAction: timeoutDetails.lastCompletedAction,
  });

  await deps.runEventRecorder.recordRunProgress(
    RUN_WORKFLOW_STEPS.EXECUTION,
    "Recoverable timeout",
    "The model timed out before choosing the next action.",
    "completed",
  );

  return deps.completeRunWithRecoveredAssistantMessage(
    run,
    text,
    buildTaskExecutionTimeoutMetadata(timeoutDetails),
    "TASK_EXECUTION_TIMEOUT: Model timed out before choosing the next action.",
  );
}

async function handleUnusableResponseRecovery(
  input: Pick<TaskExecutionRecoveryInput, "run" | "prompt" | "loop" | "deps">,
  error: LLMUnusableResponseError,
): Promise<Response> {
  const { run, deps } = input;
  const context = buildTaskExecutionRecoveryContext(input);
  const terminalLlmIssue =
    context.stats.terminalLlmIssue ??
    buildTerminalLlmIssueFromError(error, context.stats.llmRetryCount);
  const recoveryStopReason =
    context.requiresMutation && context.stats.completedMutatingToolCount === 0
      ? "incomplete_mutation"
      : "llm_stop";

  recordRecoveredAgenticLoopMetadata(run, {
    stopReason: recoveryStopReason,
    stepsExecuted: context.stats.stepsExecuted,
    toolExecutionCount: context.stats.toolExecutionCount,
    failedToolCount: context.stats.failedToolCount,
    requiresMutation: context.requiresMutation,
    completedMutatingToolCount: context.stats.completedMutatingToolCount,
    completedReadOnlyToolCount: context.stats.completedReadOnlyToolCount,
    llmRetryCount: context.stats.llmRetryCount,
    terminalLlmIssue,
    recoveryCode: "TASK_MODEL_NO_ACTION",
    toolLifecycle: context.stats.toolLifecycle,
  });

  await deps.runEventRecorder.recordRunProgress(
    RUN_WORKFLOW_STEPS.EXECUTION,
    "Recoverable model issue",
    "The model returned an unusable response before the run could continue.",
    "completed",
  );

  return deps.completeRunWithRecoveredAssistantMessage(
    run,
    buildTaskModelNoActionSummary({
      requiresMutation: context.requiresMutation,
      toolLifecycle: context.stats.toolLifecycle,
    }),
    buildTaskModelNoActionMetadata(),
    buildUnusableResponseErrorMetadata(error, terminalLlmIssue),
  );
}

function buildTaskExecutionRecoveryContext(
  input: Pick<TaskExecutionRecoveryInput, "prompt" | "loop">,
): TaskExecutionRecoveryContext {
  return {
    stats: input.loop.getStats(),
    requiresMutation: detectsMutation(input.prompt),
  };
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
  timeoutMs: number | null;
  providerId: string | null;
  modelId: string | null;
  lastCompletedAction: string | null;
}): string {
  const lines = ["The model timed out before choosing the next action."];

  if (typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)) {
    lines.push(
      `Model response timeout: ${Math.round(input.timeoutMs / 1000)}s.`,
    );
  }

  const modelLabel = formatModelLabel(input.providerId, input.modelId);
  if (modelLabel) {
    lines.push(`Active model: ${modelLabel}.`);
  }
  if (input.lastCompletedAction) {
    lines.push(`Last completed action: ${input.lastCompletedAction}.`);
  }

  lines.push(
    input.noFileChanged
      ? "No file was changed before the timeout."
      : "The run timed out after some progress, but before it could finish the next step.",
    `Execution stats so far: ${input.stepsExecuted} step(s), ${input.toolExecutionCount} tool call(s).`,
  );

  if (input.requiresMutation) {
    lines.push(
      "Retry this task with a more specific file or component target, or switch to a faster or more reliable model.",
    );
  } else {
    lines.push("Retry the task or switch to a faster or more reliable model.");
  }

  return lines.join("\n");
}

function buildTaskExecutionTimeoutMetadata(input: {
  timeoutMs: number | null;
  providerId: string | null;
  modelId: string | null;
  lastCompletedAction: string | null;
}): Record<string, unknown> {
  return {
    code: "TASK_EXECUTION_TIMEOUT",
    retryable: true,
    ...(typeof input.timeoutMs === "number"
      ? { timeoutMs: input.timeoutMs }
      : undefined),
    ...(input.providerId ? { providerId: input.providerId } : undefined),
    ...(input.modelId ? { modelId: input.modelId } : undefined),
    ...(input.lastCompletedAction
      ? { lastCompletedAction: input.lastCompletedAction }
      : undefined),
    resumeHint: "Retry the task or switch to a faster or more reliable model.",
    resumeActions: ["retry", "switch_model"],
  };
}

function buildTaskTimeoutDetails(
  run: Run,
  error: unknown,
  context: TaskExecutionRecoveryContext,
): {
  timeoutMs: number | null;
  providerId: string | null;
  modelId: string | null;
  lastCompletedAction: string | null;
} {
  const timeoutMs = resolveTaskTimeoutMs(error);
  const providerId = sanitizeOptionalString(
    run.metadata.manifest?.providerId ?? run.input.providerId ?? null,
  );
  const modelId = sanitizeOptionalString(
    run.metadata.manifest?.modelId ?? run.input.modelId ?? null,
  );
  const lastCompletedAction = describeLastCompletedAction(
    context.stats.toolLifecycle,
  );

  return {
    timeoutMs,
    providerId,
    modelId,
    lastCompletedAction,
  };
}

function resolveTaskTimeoutMs(error: unknown): number | null {
  if (error instanceof LLMTimeoutError) {
    return error.timeoutMs;
  }

  if (!(error instanceof Error)) {
    return null;
  }

  const timeoutMatch = error.message.match(/timed out after\s+(\d+)ms/i);
  if (!timeoutMatch?.[1]) {
    return null;
  }

  const parsed = Number.parseInt(timeoutMatch[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function formatModelLabel(
  providerId: string | null,
  modelId: string | null,
): string | null {
  if (providerId && modelId) {
    return `${providerId} / ${modelId}`;
  }
  return providerId ?? modelId;
}

function describeLastCompletedAction(
  toolLifecycle: TaskExecutionRecoveryContext["stats"]["toolLifecycle"],
): string | null {
  const latestCompletedEvent = [...toolLifecycle]
    .reverse()
    .find((event) => event.status === "completed");
  if (!latestCompletedEvent) {
    return null;
  }

  const displayText = sanitizeOptionalString(
    latestCompletedEvent.metadata?.displayText,
  );
  const baseAction = displayText ?? latestCompletedEvent.toolName;
  const detail = sanitizeOptionalString(latestCompletedEvent.detail);
  if (!detail) {
    return baseAction;
  }

  const compactDetail =
    detail.length <= 96 ? detail : `${detail.slice(0, 93).trimEnd()}...`;
  return `${baseAction} (${compactDetail})`;
}

function buildTerminalLlmIssueFromError(
  error: LLMUnusableResponseError,
  llmRetryCount: number,
): NonNullable<Run["metadata"]["agenticLoop"]>["terminalLlmIssue"] {
  return {
    type: "unusable_response",
    providerId: error.providerId,
    modelId: error.modelId,
    anomalyCode: error.anomalyCode,
    finishReason: error.finishReason,
    statusCode: error.statusCode,
    attempts: llmRetryCount + 1,
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
