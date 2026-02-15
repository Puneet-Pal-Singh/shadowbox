// apps/brain/src/core/orchestration/RunRecovery.ts
// Phase 3C + Phase 4E: Run recovery and state reconstruction with memory checkpoints

import type { Run, RunRepository } from "../run/index.js";
import type { Task, TaskRepository } from "../task/index.js";
import type {
  MemoryCoordinator,
  ReplayCheckpoint,
  MemoryContext,
} from "../memory/index.js";

export interface IRunRecovery {
  resumeRun(runId: string, sessionId: string): Promise<Run>;
  reconstructState(run: Run): Promise<void>;
  findLastIncompleteTask(runId: string): Promise<Task | null>;
  replayFromCheckpoint(
    runId: string,
    sessionId: string,
  ): Promise<ReplayContext>;
}

export interface ReplayContext {
  checkpoint: ReplayCheckpoint;
  memoryContext: MemoryContext;
  run: Run;
  tasks: Task[];
}

/**
 * RunRecovery manages recovery from interruptions and state reconstruction.
 * Enables runs to resume from the last incomplete task with memory context.
 */
export class RunRecovery implements IRunRecovery {
  constructor(
    private runRepo: RunRepository,
    private taskRepo: TaskRepository,
    private memoryCoordinator: MemoryCoordinator,
  ) {}

  /**
   * Resume a run after interruption with memory context
   * @param runId The run to resume
   * @param sessionId The session ID for memory retrieval
   * @returns The resumed run
   */
  async resumeRun(runId: string, sessionId: string): Promise<Run> {
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

    console.log(
      `[recovery/run] Resumed run ${runId} from status ${run.status}`,
    );
    return run;
  }

  /**
   * Replay from checkpoint to reconstruct memory and run context
   * @param runId The run to replay
   * @param sessionId The session ID for memory retrieval
   * @returns Replay context with checkpoint, memory, run, and tasks
   */
  async replayFromCheckpoint(
    runId: string,
    sessionId: string,
  ): Promise<ReplayContext> {
    // Get latest checkpoint
    const checkpoint =
      await this.memoryCoordinator.getCheckpointForResume(runId);
    if (!checkpoint) {
      throw new RunRecoveryError(`No checkpoint found for run ${runId}`);
    }

    // Get run
    const run = await this.runRepo.getById(runId);
    if (!run) {
      throw new RunRecoveryError(`Run ${runId} not found during replay`);
    }

    // Reconstruct state
    await this.reconstructState(run);

    // Get tasks
    const tasks = await this.taskRepo.getByRun(runId);

    // Retrieve memory context for the phase at checkpoint
    const memoryContext = await this.memoryCoordinator.retrieveContext({
      runId,
      sessionId,
      prompt: run.input.prompt,
      phase: checkpoint.phase,
    });

    console.log(
      `[recovery/run] Replayed from checkpoint ${checkpoint.checkpointId} at sequence ${checkpoint.sequence}`,
    );

    return {
      checkpoint,
      memoryContext,
      run,
      tasks,
    };
  }

  /**
   * Reconstruct run state based on task completion
   * - If any task CANCELLED, set run to CANCELLED
   * - If any task FAILED and not retryable, set run to FAILED
   * - If all tasks DONE, set run to COMPLETED
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

    // Run has cancelled tasks - prioritize this check
    if (cancelledCount > 0) {
      if (run.status !== "CANCELLED") {
        run.transition("CANCELLED");
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

    // All tasks completed successfully
    if (terminalCount === tasks.length && failedCount === 0) {
      if (run.status !== "COMPLETED") {
        run.transition("COMPLETED");
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
