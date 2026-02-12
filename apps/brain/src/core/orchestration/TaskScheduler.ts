// apps/brain/src/core/orchestration/TaskScheduler.ts
// Phase 3B: Sequential task execution scheduler

import type { TaskRepository } from "../task";
import { Task, TaskState } from "../task";
import type { TaskResult } from "../../types";

export interface ITaskScheduler {
  execute(runId: string): Promise<void>;
  executeSingle(taskId: string, runId: string): Promise<TaskResult>;
}

export interface TaskExecutor {
  execute(task: Task): Promise<TaskResult>;
}

/**
 * TaskScheduler manages the execution of tasks according to their dependencies.
 * Phase 3B: Sequential execution only (one task at a time)
 * Phase 3C: Will add parallel execution support
 */
export class TaskScheduler implements ITaskScheduler {
  constructor(
    private taskRepo: TaskRepository,
    private executor: TaskExecutor,
  ) {}

  async execute(runId: string): Promise<void> {
    console.log(`[task/scheduler] Starting execution for run ${runId}`);

    while (await this.hasExecutableTasks(runId)) {
      const readyTask = await this.findNextReadyTask(runId);

      if (!readyTask) {
        // Check for deadlocks or completion
        const hasPending = await this.hasPendingTasks(runId);
        if (hasPending) {
          console.error(`[task/scheduler] Deadlock detected in run ${runId}`);
          throw new SchedulerError("Task dependency deadlock detected");
        }
        break;
      }

      // Phase 3B: Execute sequentially
      await this.executeSingle(readyTask.id, runId);
    }

    console.log(`[task/scheduler] Execution complete for run ${runId}`);
  }

  async executeSingle(taskId: string, runId: string): Promise<TaskResult> {
    const task = await this.taskRepo.getById(taskId, runId);
    if (!task) {
      throw new SchedulerError(`Task ${taskId} not found in run ${runId}`);
    }

    // Validate task is ready before executing
    if (!["READY", "PENDING"].includes(task.status)) {
      throw new SchedulerError(
        `Task ${taskId} is not ready for execution (status: ${task.status})`,
      );
    }

    console.log(`[task/scheduler] Executing task ${task.id} (${task.type})`);

    // Transition to RUNNING
    task.transition("RUNNING");
    await this.taskRepo.update(task);

    try {
      // Execute the task
      const result = await this.executor.execute(task);

      // Mark as DONE
      task.transition("DONE", { output: result.output });
      await this.taskRepo.update(task);

      console.log(`[task/scheduler] Task ${task.id} completed successfully`);

      return result;
    } catch (error) {
      // Handle failure with retry logic
      return this.handleTaskFailure(task, error);
    }
  }

  private async handleTaskFailure(
    task: Task,
    error: unknown,
  ): Promise<TaskResult> {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(`[task/scheduler] Task ${task.id} failed:`, errorMessage);

    if (task.canRetry() && task.status !== "RETRYING") {
      // Avoid infinite recursion by checking if task is already retrying
      task.incrementRetry();
      task.transition("RETRYING");
      await this.taskRepo.update(task);

      console.log(
        `[task/scheduler] Retrying task ${task.id} (attempt ${task.retryCount})`,
      );

      // Execute again
      return this.executeSingle(task.id, task.runId);
    }

    // Mark as FAILED
    task.transition("FAILED", {
      error: {
        message: errorMessage,
      },
    });
    await this.taskRepo.update(task);

    return {
      taskId: task.id,
      status: "FAILED",
      error: { message: errorMessage },
      completedAt: new Date(),
    };
  }

  private async findNextReadyTask(runId: string): Promise<Task | null> {
    const allTasks = await this.taskRepo.getByRun(runId);

    for (const task of allTasks) {
      if (task.status === "READY") {
        return task;
      }

      if (task.status === "PENDING" && task.dependencies.length === 0) {
        // No dependencies - can start immediately
        task.transition("READY");
        await this.taskRepo.update(task);
        return task;
      }

      if (task.status === "PENDING" && task.dependencies.length > 0) {
        // Check if dependencies are complete
        const dependencies = await this.taskRepo.getByIds(
          task.dependencies,
          runId,
        );

        // Check for failed dependencies and cascade failure
        const failedDeps = dependencies.filter((dep) =>
          dep.status === "FAILED"
        );
        if (failedDeps.length > 0) {
          task.transition("FAILED", {
            error: {
              message: `Dependency task ${failedDeps[0].id} failed`,
            },
          });
          await this.taskRepo.update(task);
          continue; // Skip this task, try next
        }

        const allDone = dependencies.every((dep) => dep.status === "DONE");

        if (allDone) {
          task.transition("READY");
          await this.taskRepo.update(task);
          return task;
        }
      }
    }

    return null;
  }

  private async hasExecutableTasks(runId: string): Promise<boolean> {
    const allTasks = await this.taskRepo.getByRun(runId);
    return allTasks.some((task) => task.status === "READY");
  }

  private async hasPendingTasks(runId: string): Promise<boolean> {
    const allTasks = await this.taskRepo.getByRun(runId);
    return allTasks.some(
      (task) =>
        task.status === "PENDING" ||
        task.status === "READY" ||
        task.status === "RUNNING" ||
        task.status === "RETRYING",
    );
  }
}

export class SchedulerError extends Error {
  constructor(message: string) {
    super(`[task/scheduler] ${message}`);
    this.name = "SchedulerError";
  }
}
