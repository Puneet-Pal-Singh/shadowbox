import { describe, expect, it, vi } from "vitest";
import { Run } from "../run/Run.js";
import {
  LLMTimeoutError,
  LLMUnusableResponseError,
} from "../llm/LLMGateway.js";
import { tryHandleTaskExecutionErrorPolicy } from "./RunTaskExecutionRecoveryPolicy.js";

describe("RunTaskExecutionRecoveryPolicy", () => {
  it("recovers task timeouts from plain error wrappers", async () => {
    const run = new Run(
      "run-1",
      "session-1",
      "RUNNING",
      "coding",
      {
        agentType: "coding",
        prompt: "inspect the footer",
        sessionId: "session-1",
      },
    );
    const recordRunProgress = vi.fn(async () => undefined);
    const completeRunWithRecoveredAssistantMessage = vi.fn(
      async (
        currentRun: Run,
        text: string,
        metadata?: Record<string, unknown>,
        errorMetadata?: string,
      ) =>
        new Response(
          JSON.stringify({ id: currentRun.id, text, metadata, errorMetadata }),
        ),
    );
    const loop = {
      getStats: () => ({
        stopReason: "llm_stop" as const,
        stepsExecuted: 1,
        toolExecutionCount: 0,
        failedToolCount: 0,
        requiresMutation: false,
        completedMutatingToolCount: 0,
        completedReadOnlyToolCount: 0,
        llmRetryCount: 0,
        terminalLlmIssue: undefined,
        toolLifecycle: [],
      }),
    };
    const wrappedTimeout = new Error("gateway timed out (phase=task)");
    wrappedTimeout.name = "LLMTimeoutError";

    const response = await tryHandleTaskExecutionErrorPolicy({
      run,
      prompt: "inspect the footer",
      loop: loop as never,
      error: wrappedTimeout,
      deps: {
        completeRunWithRecoveredAssistantMessage,
        runEventRecorder: { recordRunProgress },
      },
    });

    expect(response).toBeInstanceOf(Response);
    expect(completeRunWithRecoveredAssistantMessage).toHaveBeenCalledWith(
      run,
      expect.stringContaining(
        "The model timed out before choosing the next action.",
      ),
      expect.objectContaining({
        code: "TASK_EXECUTION_TIMEOUT",
        retryable: true,
      }),
      "TASK_EXECUTION_TIMEOUT: Model timed out before choosing the next action.",
    );
  });

  it("derives unusable-response attempts from loop retry stats", async () => {
    const run = new Run(
      "run-1",
      "session-1",
      "RUNNING",
      "coding",
      {
        agentType: "coding",
        prompt: "inspect the footer",
        sessionId: "session-1",
      },
    );
    const recordRunProgress = vi.fn(async () => undefined);
    const completeRunWithRecoveredAssistantMessage = vi.fn(
      async (
        currentRun: Run,
        text: string,
        metadata?: Record<string, unknown>,
        errorMetadata?: string,
      ) => new Response(JSON.stringify({ id: currentRun.id, text, metadata, errorMetadata })),
    );
    const loop = {
      getStats: () => ({
        stopReason: "llm_stop" as const,
        stepsExecuted: 2,
        toolExecutionCount: 0,
        failedToolCount: 0,
        requiresMutation: false,
        completedMutatingToolCount: 0,
        completedReadOnlyToolCount: 0,
        llmRetryCount: 3,
        terminalLlmIssue: undefined,
        toolLifecycle: [],
      }),
    };
    const error = new LLMUnusableResponseError({
      providerId: "google",
      modelId: "gemini-2.5-flash-lite",
      anomalyCode: "EMPTY_CANDIDATE",
      finishReason: "stop",
      statusCode: 200,
    });

    const response = await tryHandleTaskExecutionErrorPolicy({
      run,
      prompt: "inspect the footer",
      loop: loop as never,
      error,
      deps: {
        completeRunWithRecoveredAssistantMessage,
        runEventRecorder: { recordRunProgress },
      },
    });

    expect(response).toBeInstanceOf(Response);
    expect(run.metadata.agenticLoop?.terminalLlmIssue).toMatchObject({
      providerId: "google",
      modelId: "gemini-2.5-flash-lite",
      attempts: 4,
    });
    expect(completeRunWithRecoveredAssistantMessage).toHaveBeenCalledWith(
      run,
      expect.any(String),
      expect.any(Object),
      expect.stringContaining("after 4 attempt(s)"),
    );
  });

  it("recovers typed task timeouts through the dedicated timeout handler", async () => {
    const run = new Run(
      "run-1",
      "session-1",
      "RUNNING",
      "coding",
      {
        agentType: "coding",
        prompt: "update the footer CTA",
        sessionId: "session-1",
      },
    );
    const recordRunProgress = vi.fn(async () => undefined);
    const completeRunWithRecoveredAssistantMessage = vi.fn(
      async (
        currentRun: Run,
        text: string,
        metadata?: Record<string, unknown>,
        errorMetadata?: string,
      ) =>
        new Response(
          JSON.stringify({ id: currentRun.id, text, metadata, errorMetadata }),
        ),
    );
    const loop = {
      getStats: () => ({
        stopReason: "llm_stop" as const,
        stepsExecuted: 2,
        toolExecutionCount: 1,
        failedToolCount: 0,
        requiresMutation: true,
        completedMutatingToolCount: 0,
        completedReadOnlyToolCount: 1,
        llmRetryCount: 0,
        terminalLlmIssue: undefined,
        toolLifecycle: [],
      }),
    };

    const response = await tryHandleTaskExecutionErrorPolicy({
      run,
      prompt: "update the footer CTA",
      loop: loop as never,
      error: new LLMTimeoutError({
        timeoutMs: 60_000,
        phase: "task",
        operation: "text",
      }),
      deps: {
        completeRunWithRecoveredAssistantMessage,
        runEventRecorder: { recordRunProgress },
      },
    });

    expect(response).toBeInstanceOf(Response);
    expect(recordRunProgress).toHaveBeenCalledWith(
      "execution",
      "Recoverable timeout",
      "The model timed out before choosing the next action.",
      "completed",
    );
    expect(completeRunWithRecoveredAssistantMessage).toHaveBeenCalledWith(
      run,
      expect.stringContaining("No file was changed before the timeout."),
      expect.objectContaining({
        code: "TASK_EXECUTION_TIMEOUT",
      }),
      "TASK_EXECUTION_TIMEOUT: Model timed out before choosing the next action.",
    );
  });
});
