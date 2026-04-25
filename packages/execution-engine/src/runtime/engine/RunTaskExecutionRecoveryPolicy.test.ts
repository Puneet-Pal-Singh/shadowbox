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

  it("recovers provider retry exhaustion with a retryable provider-unavailable summary", async () => {
    const run = new Run(
      "run-1",
      "session-1",
      "RUNNING",
      "coding",
      {
        agentType: "coding",
        prompt: "check my open PR and CI checks",
        sessionId: "session-1",
        providerId: "google",
        modelId: "gemma-4-31b-it",
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
        stepsExecuted: 3,
        toolExecutionCount: 2,
        failedToolCount: 0,
        requiresMutation: false,
        completedMutatingToolCount: 0,
        completedReadOnlyToolCount: 2,
        llmRetryCount: 0,
        terminalLlmIssue: undefined,
        toolLifecycle: [
          {
            toolCallId: "tool-1",
            toolName: "git_status",
            status: "completed" as const,
            mutating: false,
            recordedAt: "2026-04-24T00:00:00.000Z",
          },
        ],
      }),
    };
    const providerError = Object.assign(
      new Error("Failed after 3 attempts. Last error: Internal error encountered."),
      {
        name: "AI_RetryError",
        cause: { statusCode: 500, message: "Internal error encountered." },
      },
    );

    const response = await tryHandleTaskExecutionErrorPolicy({
      run,
      prompt: "check my open PR and CI checks",
      loop: loop as never,
      error: providerError,
      deps: {
        completeRunWithRecoveredAssistantMessage,
        runEventRecorder: { recordRunProgress },
      },
    });

    expect(response).toBeInstanceOf(Response);
    expect(recordRunProgress).toHaveBeenCalledWith(
      "execution",
      "Recoverable provider interruption",
      "The provider failed repeatedly before the next action could be produced.",
      "completed",
    );
    expect(completeRunWithRecoveredAssistantMessage).toHaveBeenCalledWith(
      run,
      expect.stringContaining(
        "The model provider became unavailable after repeated retries before the next action could be produced.",
      ),
      expect.objectContaining({
        code: "PROVIDER_UNAVAILABLE",
        retryable: true,
        statusCode: 500,
        providerId: "google",
        modelId: "gemma-4-31b-it",
      }),
      expect.stringContaining("PROVIDER_UNAVAILABLE:"),
    );
  });

  it("recovers network-connection-loss failures as provider unavailable", async () => {
    const run = new Run("run-1", "session-1", "RUNNING", "coding", {
      agentType: "coding",
      prompt: "continue editing footer",
      sessionId: "session-1",
      providerId: "openrouter",
      modelId: "inclusionai/ling-2.6-flash:free",
    });
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
        stepsExecuted: 4,
        toolExecutionCount: 3,
        failedToolCount: 0,
        requiresMutation: true,
        completedMutatingToolCount: 1,
        completedReadOnlyToolCount: 2,
        llmRetryCount: 0,
        terminalLlmIssue: undefined,
        toolLifecycle: [
          {
            toolCallId: "tool-1",
            toolName: "write_file",
            status: "completed" as const,
            mutating: true,
            detail: "Updated src/components/layout/Footer.tsx",
            recordedAt: "2026-04-25T00:00:00.000Z",
          },
        ],
      }),
    };

    const response = await tryHandleTaskExecutionErrorPolicy({
      run,
      prompt: "continue editing footer",
      loop: loop as never,
      error: new Error("Network connection lost."),
      deps: {
        completeRunWithRecoveredAssistantMessage,
        runEventRecorder: { recordRunProgress },
      },
    });

    expect(response).toBeInstanceOf(Response);
    expect(completeRunWithRecoveredAssistantMessage).toHaveBeenCalledWith(
      run,
      expect.stringContaining(
        "The model provider became unavailable after repeated retries before the next action could be produced.",
      ),
      expect.objectContaining({
        code: "PROVIDER_UNAVAILABLE",
        retryable: true,
        providerId: "openrouter",
        modelId: "inclusionai/ling-2.6-flash:free",
      }),
      expect.stringContaining("signal=network connection lost."),
    );
  });
});
