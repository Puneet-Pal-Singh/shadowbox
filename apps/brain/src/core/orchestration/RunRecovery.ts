// apps/brain/src/core/orchestration/RunRecovery.ts
// Phase 3C: Run recovery and state reconstruction

import type { Run, RunRepository } from "../run";
import type { Task, TaskRepository } from "../task";

export interface IRunRecovery {
  resumeRun(runId: string): Promise<Run>;
  reconstructState(run: Run): Promise<void>;
  findLastIncompleteTask(runId: string): Promise<Task | null>;
}

/**
 * RunRecovery manages recovery from interruptions and state reconstruction.
 * Enables runs to resume from the last incomplete task.
 */
export class RunRecovery implements IRunRecovery {
  constructor(
    private runRepo: RunRepository,
    private taskRepo: TaskRepository,
  ) {}

  /**
   * Resume a run after interruption
   * @param runId The run to resume
   * @returns The resumed run
   */
  async resumeRun(runId: string): Promise<Run> {
    const run = await this.runRepo.getById(runId);
    if (!run) {
      throw new RunRecoveryError(`Run ${runId} not found`);
    }

    // Reconstruct state based on task status
    await this.reconstructState(run);

    // Verify run can be resumed
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) {
      throw new RunRecoveryError(
        `Cannot resume run ${runId} - status is ${run.status}`,
      );
    }

    console.log(`[recovery/run] Resumed run ${runId} from status ${run.status}`);
    return run;
  }

  /**
   * Reconstruct run state based on task completion
   * - If all tasks DONE, set run to COMPLETED
   * - If any task FAILED and not retryable, set run to FAILED
   * - Otherwise, keep current status (PLANNING, RUNNING, etc)
   */
  async reconstructState(run: Run): Promise<void> {
    const tasks = await this.taskRepo.getByRun(run.id);

    if (tasks.length === 0) {
      return; // No tasks yet, state OK
    }

    // Count task states
    const statuses = tasks.map((t) => t.status);
    const doneCount = statuses.filter((s) => s === "DONE").length;
    const failedCount = statuses.filter((s) => s === "FAILED").length;
    const cancelledCount = statuses.filter((s) => s === "CANCELLED").length;
    const terminalCount = doneCount + failedCount + cancelledCount;

    // All tasks completed successfully
    if (terminalCount === tasks.length && failedCount === 0) {
      if (run.status !== "COMPLETED") {
        run.transition("COMPLETED");
        await this.runRepo.update(run);
      }
      return;
    }

    // Run has failed tasks
    if (failedCount > 0) {
      if (run.status !== "FAILED") {
        run.transition("FAILED");
        run.metadata.error = `${failedCount} task(s) failed`;
        await this.runRepo.update(run);
      }
      return;
    }

    // Run has cancelled tasks
    if (cancelledCount > 0) {
      if (run.status !== "CANCELLED") {
        run.transition("CANCELLED");
        await this.runRepo.update(run);
      }
      return;
    }

    // Some tasks still running/pending - keep current status
    if (![`PLANNING`, `RUNNING`].includes(run.status)) {
      run.transition("RUNNING");
      await this.runRepo.update(run);
    }
  }

  /**
   * Find the last task that is not complete (terminal state)
   * Useful for resuming from where execution left off
   */
  async findLastIncompleteTask(runId: string): Promise<Task | null> {
    const tasks = await this.taskRepo.getByRun(runId);

    // Find last task that is not in terminal state
    for (let i = tasks.length - 1; i >= 0; i--) {
      const task = tasks[i];
      if (task && !["DONE", "FAILED", "CANCELLED"].includes(task.status)) {
        return task;
      }
    }

    return null;
  }
}

export class RunRecoveryError extends Error {
  constructor(message: string) {
    super(`[recovery/run] ${message}`);
    this.name = "RunRecoveryError";
  }
}
