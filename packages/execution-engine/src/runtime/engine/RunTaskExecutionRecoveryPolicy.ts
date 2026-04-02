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

export async function tryHandleTaskExecutionErrorPolicy(input: {
  run: Run;
  prompt: string;
  loop: AgenticLoop;
  error: unknown;
  deps: TaskExecutionRecoveryDependencies;
}): Promise<Response | null> {
  const { run, prompt, loop, error, deps } = input;

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
    await deps.runEventRecorder.recordRunProgress(
      RUN_WORKFLOW_STEPS.EXECUTION,
      "Recoverable timeout",
      "The model timed out before choosing the next action.",
      "completed",
    );

    return deps.completeRunWithRecoveredAssistantMessage(
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
  const terminalLlmIssue =
    stats.terminalLlmIssue ?? buildTerminalLlmIssueFromError(error);
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
    terminalLlmIssue,
    recoveryCode: "TASK_MODEL_NO_ACTION",
    toolLifecycle: stats.toolLifecycle,
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
      requiresMutation,
      stepsExecuted: stats.stepsExecuted,
      toolExecutionCount: stats.toolExecutionCount,
      failedToolCount: stats.failedToolCount,
      toolLifecycle: stats.toolLifecycle,
    }),
    buildTaskModelNoActionMetadata(),
    buildUnusableResponseErrorMetadata(error, terminalLlmIssue),
  );
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
