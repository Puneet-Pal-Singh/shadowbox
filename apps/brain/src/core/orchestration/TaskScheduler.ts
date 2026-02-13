// apps/brain/src/core/orchestration/TaskScheduler.ts
// Phase 3C: Parallel task execution scheduler with concurrency limits

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

export interface SchedulerConfig {
  concurrencyLimit?: number;
}

/**
 * TaskScheduler manages the execution of tasks according to their dependencies.
 * Phase 3B: Sequential execution (concurrencyLimit = 1)
 * Phase 3C: Parallel execution with configurable concurrency limit
 */
export class TaskScheduler implements ITaskScheduler {
  private concurrencyLimit: number;

  constructor(
    private taskRepo: TaskRepository,
    private executor: TaskExecutor,
    config: SchedulerConfig = {},
  ) {
    this.concurrencyLimit = config.concurrencyLimit ?? 1;
    if (this.concurrencyLimit < 1) {
      throw new SchedulerError("concurrencyLimit must be >= 1");
    }
  }

  async execute(runId: string): Promise<void> {
    console.log(
      `[task/scheduler] Starting execution for run ${runId} (concurrency: ${this.concurrencyLimit})`,
    );

    while (await this.hasExecutableTasks(runId)) {
      // Find all ready tasks (up to concurrency limit)
      const readyTasks = await this.findAllReadyTasks(runId);

      if (readyTasks.length === 0) {
        // Check for deadlocks or completion
        const hasPending = await this.hasPendingTasks(runId);
        if (hasPending) {
          console.error(`[task/scheduler] Deadlock detected in run ${runId}`);
          throw new SchedulerError("Task dependency deadlock detected");
        }
        break;
      }

      // Phase 3C: Execute in parallel batches up to concurrency limit
      const batch = readyTasks.slice(0, this.concurrencyLimit);
      console.log(
        `[task/scheduler] Executing batch of ${batch.length} task(s)`,
      );

      await this.executeBatch(batch, runId);
    }

    console.log(`[task/scheduler] Execution complete for run ${runId}`);
  }

  private async executeBatch(tasks: Task[], runId: string): Promise<void> {
    // Execute all tasks in parallel
    const promises = tasks.map((task) =>
      this.executeSingle(task.id, runId).catch((error) => {
        // Collect errors but continue batch execution
        console.error(
          `[task/scheduler] Batch task ${task.id} failed:`,
          error instanceof Error ? error.message : String(error),
        );
        // Return empty result to keep batch processing
        return {
          taskId: task.id,
          status: "FAILED" as const,
          error: {
            message: error instanceof Error ? error.message : "Unknown error",
          },
          completedAt: new Date(),
        };
      }),
    );

    // Wait for all tasks to complete (both success and failure)
    await Promise.all(promises);
  }

  async executeSingle(taskId: string, runId: string): Promise<TaskResult> {
    const task = await this.taskRepo.getById(taskId, runId);
    if (!task) {
      throw new SchedulerError(`Task ${taskId} not found in run ${runId}`);
    }

    // Validate task is ready before executing (allow RETRYING for retry logic)
    if (!["READY", "PENDING", "RETRYING"].includes(task.status)) {
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

  private async findAllReadyTasks(runId: string): Promise<Task[]> {
    const allTasks = await this.taskRepo.getByRun(runId);
    const readyTasks: Task[] = [];

    for (const task of allTasks) {
      if (task.status === "READY") {
        readyTasks.push(task);
        continue;
      }

      if (task.status !== "PENDING") {
        continue;
      }

      // Handle PENDING tasks
      const isReady = await this.preparePendingTask(task, runId);
      if (isReady) {
        readyTasks.push(task);
      }
    }

    return readyTasks;
  }

  private async preparePendingTask(
    task: Task,
    runId: string,
  ): Promise<boolean> {
    // No dependencies - can start immediately
    if (task.dependencies.length === 0) {
      task.transition("READY");
      await this.taskRepo.update(task);
      return true;
    }

    // Has dependencies - check if all are done
    return await this.checkDependencies(task, runId);
  }

  private async checkDependencies(task: Task, runId: string): Promise<boolean> {
    const dependencies = await this.taskRepo.getByIds(
      task.dependencies,
      runId,
    );

    // Verify all requested dependencies were found
    if (dependencies.length !== task.dependencies.length) {
      await this.failTaskMissingDeps(task);
      return false;
    }

    // Check for failed dependencies
    const failedDep = dependencies.find((d) => d.status === "FAILED");
    if (failedDep) {
      await this.failTaskDependencyFailed(task, failedDep);
      return false;
    }

    // All dependencies done?
    const allDone = dependencies.every((d) => d.status === "DONE");
    if (allDone) {
      task.transition("READY");
      await this.taskRepo.update(task);
      return true;
    }

    return false;
  }

  private async failTaskMissingDeps(task: Task): Promise<void> {
    // Missing deps already identified by count mismatch
    const missingCount = task.dependencies.length;
    task.transition("FAILED", {
      error: {
        message: `Missing dependencies: ${missingCount} not found`,
      },
    });
    await this.taskRepo.update(task);
  }

  private async failTaskDependencyFailed(
    task: Task,
    failedDep: Task,
  ): Promise<void> {
    task.transition("FAILED", {
      error: { message: `Dependency task ${failedDep.id} failed` },
    });
    await this.taskRepo.update(task);
  }

  private async hasExecutableTasks(runId: string): Promise<boolean> {
    const allTasks = await this.taskRepo.getByRun(runId);
    // Check for READY tasks or PENDING tasks that can be made ready
    return allTasks.some((task) => task.isReady());
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
