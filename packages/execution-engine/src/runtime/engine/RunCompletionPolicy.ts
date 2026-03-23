import type { CoreMessage } from "ai";
import { RUN_WORKFLOW_STEPS } from "@repo/shared-types";
import type { MemoryCoordinator } from "../memory/index.js";
import type { Run, RunRepository } from "../run/index.js";
import type { RunEventRecorder } from "../events/index.js";
import { buildPlanningRecoveryMessage } from "./RunPlanningRecoveryPolicy.js";
import {
  recordLifecycleStep,
  recordOrchestrationTerminal,
  recordPhaseSelectionSnapshot,
} from "./RunMetadataPolicy.js";
import { sanitizeUserFacingOutput } from "./RunOutputSanitizer.js";
import { transitionRunToCompleted } from "./RunStatusPolicy.js";

export interface RunCompletionDependencies {
  memoryCoordinator: MemoryCoordinator;
  persistConversationMessages: (
    runId: string,
    sessionId: string,
    messages: CoreMessage[],
    role: "user" | "assistant",
  ) => Promise<void>;
  runEventRecorder: RunEventRecorder;
  runRepo: Pick<RunRepository, "update">;
  safeMemoryOperation: <T>(
    operation: () => Promise<T>,
  ) => Promise<T | undefined>;
}

export function createStreamResponse(content: string): Response {
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

export async function completeRunWithAssistantMessage(params: {
  run: Run;
  text: string;
  deps: RunCompletionDependencies;
}): Promise<Response> {
  const { run, text, deps } = params;
  const sanitizedText = sanitizeUserFacingOutput(text);
  recordLifecycleStep(run, "SYNTHESIS");
  await deps.runEventRecorder.recordRunStatusChanged(
    run.status,
    run.status,
    RUN_WORKFLOW_STEPS.SYNTHESIS,
  );

  await deps.safeMemoryOperation(() =>
    deps.memoryCoordinator.extractAndPersist({
      runId: run.id,
      sessionId: run.sessionId,
      source: "synthesis",
      content: sanitizedText,
      phase: "synthesis",
    }),
  );

  await deps.safeMemoryOperation(() =>
    deps.persistConversationMessages(
      run.id,
      run.sessionId,
      [{ role: "assistant", content: sanitizedText }],
      "assistant",
    ),
  );

  await deps.safeMemoryOperation(() =>
    deps.memoryCoordinator.createCheckpoint({
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
  await deps.runEventRecorder.recordMessageEmitted("assistant", sanitizedText);
  await deps.runEventRecorder.recordRunCompleted(
    getRunDurationMs(run),
    run.metadata.agenticLoop?.toolExecutionCount ?? 0,
  );
  await deps.runRepo.update(run);
  console.log(`[run/engine] Completed assistant run ${run.id}`);

  return createStreamResponse(sanitizedText);
}

export async function completeRunWithRecoveredAssistantMessage(params: {
  run: Run;
  text: string;
  technicalError?: string;
  deps: RunCompletionDependencies;
}): Promise<Response> {
  const { run, text, technicalError, deps } = params;
  const sanitizedText = sanitizeUserFacingOutput(text);
  recordLifecycleStep(run, "SYNTHESIS", "planning_recovery");
  await deps.runEventRecorder.recordRunStatusChanged(
    run.status,
    run.status,
    RUN_WORKFLOW_STEPS.SYNTHESIS,
  );

  await deps.safeMemoryOperation(() =>
    deps.memoryCoordinator.extractAndPersist({
      runId: run.id,
      sessionId: run.sessionId,
      source: "synthesis",
      content: sanitizedText,
      phase: "synthesis",
    }),
  );

  await deps.safeMemoryOperation(() =>
    deps.persistConversationMessages(
      run.id,
      run.sessionId,
      [{ role: "assistant", content: sanitizedText }],
      "assistant",
    ),
  );

  transitionRunToCompleted(run, run.id);
  if (technicalError) {
    run.metadata.error = technicalError;
  }
  recordLifecycleStep(run, "TERMINAL", "status=COMPLETED:recoverable");
  recordOrchestrationTerminal(run);
  run.output = { content: sanitizedText };
  await deps.runEventRecorder.recordMessageEmitted("assistant", sanitizedText);
  await deps.runEventRecorder.recordRunCompleted(getRunDurationMs(run), 0);
  await deps.runRepo.update(run);

  console.log(`[run/engine] Completed run ${run.id} with recoverable error`);
  return createStreamResponse(sanitizedText);
}

export async function tryHandlePlanningError(params: {
  run: Run;
  runId: string;
  error: unknown;
  deps: RunCompletionDependencies;
}): Promise<Response | null> {
  const { run, runId, error, deps } = params;
  const technicalMessage =
    error instanceof Error ? error.message : "Planning phase failed";
  const userMessage = buildPlanningRecoveryMessage(error);
  if (!userMessage) {
    return null;
  }

  console.log(
    `[run/engine] Recoverable planning error for run ${runId}: ${technicalMessage}`,
  );

  return completeRunWithRecoveredAssistantMessage({
    run,
    text: userMessage,
    technicalError: technicalMessage,
    deps,
  });
}

export function getRunDurationMs(run: Run): number {
  const startedAt = run.metadata.startedAt ?? run.createdAt.toISOString();
  const startedAtMs = Date.parse(startedAt);
  if (Number.isNaN(startedAtMs)) {
    return 0;
  }
  return Math.max(0, Date.now() - startedAtMs);
}
