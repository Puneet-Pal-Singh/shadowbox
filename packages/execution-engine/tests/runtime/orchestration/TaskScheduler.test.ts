import { describe, it, expect } from "vitest";
import { TaskScheduler, type TaskExecutor } from "../../../src/runtime/orchestration/TaskScheduler.js";
import { Task } from "../../../src/runtime/task/Task.js";
import type { TaskRepository } from "../../../src/runtime/task/TaskRepository.js";
import type { TaskResult } from "../../../src/runtime/types.js";

class InMemoryTaskRepository {
  private readonly tasks = new Map<string, Task>();

  constructor(seedTasks: Task[]) {
    for (const task of seedTasks) {
      this.tasks.set(this.key(task.id, task.runId), task);
    }
  }

  async getById(taskId: string, runId: string): Promise<Task | null> {
    return this.tasks.get(this.key(taskId, runId)) ?? null;
  }

  async getByRun(runId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter((task) => task.runId === runId);
  }

  async getByIds(taskIds: string[], runId: string): Promise<Task[]> {
    return taskIds
      .map((taskId) => this.tasks.get(this.key(taskId, runId)))
      .filter((task): task is Task => task !== undefined);
  }

  async update(task: Task): Promise<void> {
    this.tasks.set(this.key(task.id, task.runId), task);
  }

  private key(taskId: string, runId: string): string {
    return `${runId}:${taskId}`;
  }
}

class FailOnceOnFailedUpdateRepository extends InMemoryTaskRepository {
  private failedOnce = false;

  override async update(task: Task): Promise<void> {
    if (task.status === "FAILED" && !this.failedOnce) {
      this.failedOnce = true;
      throw new Error("simulated repository write failure");
    }
    await super.update(task);
  }
}

describe("TaskScheduler retry handling", () => {
  it("retries after failure by transitioning RUNNING -> FAILED -> RETRYING", async () => {
    const task = new Task(
      "task-1",
      "run-1",
      "shell",
      "READY",
      [],
      { description: "Retryable task" },
      undefined,
      undefined,
      0,
      1,
    );

    const repository = new InMemoryTaskRepository([task]);
    let attempts = 0;

    const executor: TaskExecutor = {
      execute: async (currentTask): Promise<TaskResult> => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("transient failure");
        }
        return {
          taskId: currentTask.id,
          status: "DONE",
          output: { content: "ok" },
          completedAt: new Date(),
        };
      },
    };

    const scheduler = new TaskScheduler(
      repository as unknown as TaskRepository,
      executor,
    );

    const result = await scheduler.executeSingle("task-1", "run-1");

    expect(result.status).toBe("DONE");
    expect(attempts).toBe(2);

    const storedTask = await repository.getById("task-1", "run-1");
    expect(storedTask?.status).toBe("DONE");
    expect(storedTask?.retryCount).toBe(1);
  });

  it("best-effort marks task FAILED when batch-level catch handles an update failure", async () => {
    const task = new Task(
      "task-batch-1",
      "run-batch-1",
      "shell",
      "PENDING",
      [],
      { description: "batch failover task" },
      undefined,
      undefined,
      0,
      0,
    );

    const repository = new FailOnceOnFailedUpdateRepository([task]);
    const executor: TaskExecutor = {
      execute: async () => {
        throw new Error("executor failure");
      },
    };

    const scheduler = new TaskScheduler(
      repository as unknown as TaskRepository,
      executor,
    );

    await scheduler.execute("run-batch-1");

    const persistedTask = await repository.getById("task-batch-1", "run-batch-1");
    expect(persistedTask?.status).toBe("FAILED");
    expect(persistedTask?.error?.message).toContain("executor failure");
  });
});
