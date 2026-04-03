import { describe, expect, it, vi } from "vitest";
import { Run } from "../run/Run.js";
import { LLMUnusableResponseError } from "../llm/LLMGateway.js";
import { tryHandleTaskExecutionErrorPolicy } from "./RunTaskExecutionRecoveryPolicy.js";

describe("RunTaskExecutionRecoveryPolicy", () => {
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
});
