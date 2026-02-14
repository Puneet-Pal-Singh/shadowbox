// apps/brain/src/core/orchestration/TaskScheduler.ts
// Phase 3C: Parallel task execution scheduler with concurrency limits

import type { TaskRepository } from "../task/index.js";
import { Task, TaskState } from "../task/index.js";
import type { TaskResult } from "../types.js";

export interface ITaskScheduler {
  execute(runId: string, hooks?: SchedulerHooks): Promise<void>;
  executeSingle(taskId: string, runId: string): Promise<TaskResult>;
}

export interface TaskExecutor {
  execute(task: Task): Promise<TaskResult>;
}

export interface SchedulerConfig {
  concurrencyLimit?: number;
}

export interface SchedulerHooks {
  beforeTask?: (task: Task) => Promise<void>;
  afterTask?: (task: Task, result: TaskResult) => Promise<void>;
  onTaskError?: (task: Task, error: unknown) => Promise<void>;
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

  async execute(runId: string, hooks?: SchedulerHooks): Promise<void> {
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

      await this.executeBatch(batch, runId, hooks);
    }

    console.log(`[task/scheduler] Execution complete for run ${runId}`);
  }

  private async executeBatch(
    tasks: Task[],
    runId: string,
    hooks?: SchedulerHooks,
  ): Promise<void> {
    // Execute all tasks in parallel
    const promises = tasks.map((task) =>
      this.executeSingleWithHooks(task.id, runId, hooks).catch((error) => {
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
    return this.executeSingleWithHooks(taskId, runId, undefined);
  }

  private async executeSingleWithHooks(
    taskId: string,
    runId: string,
    hooks?: SchedulerHooks,
  ): Promise<TaskResult> {
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

    if (hooks?.beforeTask) {
      await hooks.beforeTask(task);
    }

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

      if (hooks?.afterTask) {
        await hooks.afterTask(task, result);
      }

      return result;
    } catch (error) {
      if (hooks?.onTaskError) {
        await hooks.onTaskError(task, error);
      }
      // Handle failure with retry logic
      const failed = await this.handleTaskFailure(task, error);
      if (hooks?.afterTask) {
        await hooks.afterTask(task, failed);
      }
      return failed;
    }
  }

  private async handleTaskFailure(
    task: Task,
    error: unknown,
  ): Promise<TaskResult> {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(`[task/scheduler] Task ${task.id} failed:`, errorMessage);

    // Move RUNNING -> FAILED first so retry eligibility reflects task state machine.
    task.transition("FAILED", {
      error: {
        message: errorMessage,
      },
    });

    if (task.canRetry()) {
      task.incrementRetry();
      task.transition("RETRYING");
      await this.taskRepo.update(task);

      console.log(
        `[task/scheduler] Retrying task ${task.id} (attempt ${task.retryCount})`,
      );

      // Execute again
      return this.executeSingle(task.id, task.runId);
    }

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
      const foundIds = new Set(dependencies.map((d) => d.id));
      const missingIds = task.dependencies.filter((id) => !foundIds.has(id));
      await this.failTaskMissingDeps(task, missingIds);
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

  private async failTaskMissingDeps(
    task: Task,
    missingIds: string[],
  ): Promise<void> {
    task.transition("FAILED", {
      error: {
        message: `Missing dependencies: ${missingIds.join(", ")}`,
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
    // Check for READY or PENDING tasks
    // PENDING tasks will be evaluated in findAllReadyTasks() for dependency resolution
    return allTasks.some(
      (task) => task.status === "READY" || task.status === "PENDING",
    );
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
