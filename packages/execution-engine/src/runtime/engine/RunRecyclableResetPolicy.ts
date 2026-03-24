import type { Run, RunRepository } from "../run/index.js";
import type { Task, TaskRepository } from "../task/index.js";
import type { RunInput, RunStatus } from "../types.js";

interface ResetRecyclableRunInput {
  runId: string;
  sessionId: string;
  input: RunInput;
  previousStatus: RunStatus;
  taskRepo: Pick<TaskRepository, "getByRun" | "deleteByRun" | "create">;
  runRepo: Pick<RunRepository, "update">;
  createFreshRun: (runId: string, sessionId: string, input: RunInput) => Run;
}

export async function resetRecyclableRun(
  params: ResetRecyclableRunInput,
): Promise<Run> {
  const { runId, sessionId, input, previousStatus, taskRepo, runRepo } = params;
  const taskSnapshot = await taskRepo.getByRun(runId);
  const resetRun = params.createFreshRun(runId, sessionId, input);

  try {
    await taskRepo.deleteByRun(runId);
    await runRepo.update(resetRun);
  } catch (error) {
    await restoreTaskSnapshot(runId, taskSnapshot, taskRepo, error);
    throw error;
  }

  console.log(
    `[run/engine] Reset recyclable run ${runId} (${previousStatus}) for next turn with refreshed selection`,
  );
  return resetRun;
}

async function restoreTaskSnapshot(
  runId: string,
  taskSnapshot: Task[],
  taskRepo: Pick<TaskRepository, "create">,
  originalError: unknown,
): Promise<void> {
  console.error(
    `[run/engine] Reset recyclable run failed for ${runId}; restoring ${taskSnapshot.length} task(s)`,
    originalError,
  );

  try {
    for (const task of taskSnapshot) {
      await taskRepo.create(task);
    }
  } catch (restoreError) {
    console.error(
      `[run/engine] Task restore failed for recyclable run ${runId}`,
      restoreError,
    );
  }
}
