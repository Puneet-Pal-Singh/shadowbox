import type { Run } from "../run/index.js";
import type { RunRepository } from "../run/index.js";
import type { RunEventRecorder } from "../events/index.js";
import { recordLifecycleStep, recordOrchestrationTerminal } from "./RunMetadataPolicy.js";
import { transitionRunToFailed } from "./RunStatusPolicy.js";

export async function handleExecutionErrorPolicy(input: {
  runId: string;
  error: unknown;
  runRepo: RunRepository;
  runEventRecorder: RunEventRecorder;
  getRunDurationMs: (run: Run) => number;
}): Promise<void> {
  const errorMessage =
    input.error instanceof Error ? input.error.message : "Unknown execution error";
  try {
    const run = await input.runRepo.getById(input.runId);
    if (run) {
      transitionRunToFailed(run, input.runId);
      recordLifecycleStep(run, "TERMINAL", "status=FAILED");
      recordOrchestrationTerminal(run);
      run.metadata.error = errorMessage;
      await input.runRepo.update(run);
      if (run.status === "FAILED") {
        await input.runEventRecorder.recordRunFailed(
          errorMessage,
          input.getRunDurationMs(run),
        );
      }
    }
  } catch (handlerError) {
    console.error(
      `[run/engine] Failed to handle execution error for run ${input.runId}:`,
      handlerError,
    );
  }

  console.error(`[run/engine] Run ${input.runId} failed:`, errorMessage);
}

export async function safeMemoryOperation<T>(
  operation: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    console.warn("[run/engine] Memory subsystem operation failed:", error);
    return undefined;
  }
}
