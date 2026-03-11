import { describe, expect, it, vi } from "vitest";
import { TaskScheduler } from "./TaskScheduler.js";
import { Task, TaskRepository } from "../task/index.js";
import type {
  RuntimeDurableObjectState,
  RuntimeStorage,
  TaskResult,
} from "../types.js";

describe("TaskScheduler", () => {
  it("marks tasks as FAILED when executor returns a non-DONE status", async () => {
    const ctx = new MockRuntimeState();
    const taskRepo = new TaskRepository(ctx);
    const task = new Task("1", "run-1", "shell", "READY", [], {
      description: "Run command",
      command: "check if node exists",
    });
    await taskRepo.create(task);

    const executor = {
      execute: vi.fn(
        async (): Promise<TaskResult> => ({
          taskId: "1",
          status: "FAILED",
          error: { message: "Command not allowed: Check" },
          completedAt: new Date(),
        }),
      ),
    };

    const scheduler = new TaskScheduler(taskRepo, executor);
    const result = await scheduler.executeSingle("1", "run-1");

    expect(result.status).toBe("FAILED");
    expect(result.error?.message).toContain("Command not allowed");
    expect(executor.execute).toHaveBeenCalledTimes(1);

    const persisted = await taskRepo.getById("1", "run-1");
    expect(persisted?.status).toBe("FAILED");
    expect(persisted?.error?.message).toContain("Command not allowed");
  });

  it("keeps DONE behavior unchanged for successful executor results", async () => {
    const ctx = new MockRuntimeState();
    const taskRepo = new TaskRepository(ctx);
    const task = new Task("2", "run-2", "shell", "READY", [], {
      description: "Run command",
      command: "node --version",
    });
    await taskRepo.create(task);

    const executor = {
      execute: vi.fn(
        async (): Promise<TaskResult> => ({
          taskId: "2",
          status: "DONE",
          output: { content: "v20.0.0" },
          completedAt: new Date(),
        }),
      ),
    };

    const scheduler = new TaskScheduler(taskRepo, executor);
    const result = await scheduler.executeSingle("2", "run-2");

    expect(result.status).toBe("DONE");

    const persisted = await taskRepo.getById("2", "run-2");
    expect(persisted?.status).toBe("DONE");
    expect(persisted?.output?.content).toBe("v20.0.0");
  });

  it("does not retry deterministic failures and emits retry reason code", async () => {
    const ctx = new MockRuntimeState();
    const taskRepo = new TaskRepository(ctx);
    const task = new Task("3", "run-3", "shell", "READY", [], {
      description: "Read missing file",
      command: "cat missing-file.txt",
    });
    await taskRepo.create(task);

    const executor = {
      execute: vi.fn(
        async (): Promise<TaskResult> => {
          throw new Error("No such file or directory");
        },
      ),
    };

    const onRetryDecision = vi.fn(async () => {});
    const scheduler = new TaskScheduler(taskRepo, executor);
    await scheduler.execute("run-3", { onRetryDecision });

    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(onRetryDecision).toHaveBeenCalledTimes(1);
    const [, classification] = onRetryDecision.mock.calls[0] as [
      Task,
      { retryable: boolean; reasonCode: string },
    ];
    expect(classification.retryable).toBe(false);
    expect(classification.reasonCode).toBe("DETERMINISTIC_INVALID_TARGET");
  });

  it("emits non-retryable decision when retry budget is exhausted", async () => {
    const ctx = new MockRuntimeState();
    const taskRepo = new TaskRepository(ctx);
    const task = new Task(
      "4",
      "run-4",
      "shell",
      "READY",
      [],
      {
        description: "Call service",
        command: "curl https://example.com",
      },
      undefined,
      undefined,
      0,
      0,
    );
    await taskRepo.create(task);

    const executor = {
      execute: vi.fn(
        async (): Promise<TaskResult> => {
          throw new Error("upstream timeout");
        },
      ),
    };

    const onRetryDecision = vi.fn(async () => {});
    const scheduler = new TaskScheduler(taskRepo, executor);
    await scheduler.execute("run-4", { onRetryDecision });

    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(onRetryDecision).toHaveBeenCalledTimes(1);
    const [, classification] = onRetryDecision.mock.calls[0] as [
      Task,
      { retryable: boolean; reasonCode: string },
    ];
    expect(classification.retryable).toBe(false);
    expect(classification.reasonCode).toBe("TRANSIENT_OR_UNKNOWN");
  });

  it("continues scheduler flow when onRetryDecision hook throws", async () => {
    const ctx = new MockRuntimeState();
    const taskRepo = new TaskRepository(ctx);
    const task = new Task("5", "run-5", "shell", "READY", [], {
      description: "Read missing file",
      command: "cat missing-file.txt",
    });
    await taskRepo.create(task);

    const executor = {
      execute: vi.fn(
        async (): Promise<TaskResult> => {
          throw new Error("No such file or directory");
        },
      ),
    };

    const scheduler = new TaskScheduler(taskRepo, executor);
    await expect(
      scheduler.execute("run-5", {
        onRetryDecision: vi.fn(async () => {
          throw new Error("telemetry unavailable");
        }),
      }),
    ).resolves.toBeUndefined();

    const persisted = await taskRepo.getById("5", "run-5");
    expect(persisted?.status).toBe("FAILED");
  });

  it("parallelizes read-only tasks while serializing mutating tasks", async () => {
    const ctx = new MockRuntimeState();
    const taskRepo = new TaskRepository(ctx);
    await taskRepo.create(
      new Task("r1", "run-parallel", "analyze", "READY", [], {
        description: "Analyze A",
      }),
    );
    await taskRepo.create(
      new Task("r2", "run-parallel", "analyze", "READY", [], {
        description: "Analyze B",
      }),
    );
    await taskRepo.create(
      new Task("m1", "run-parallel", "edit", "READY", [], {
        description: "Edit file",
      }),
    );

    let activeCount = 0;
    let maxActive = 0;
    let completedReadOnly = 0;
    let editStartedAfterReadOnly = true;

    const executor = {
      execute: vi.fn(async (task: Task): Promise<TaskResult> => {
        if (task.type === "edit" && completedReadOnly < 2) {
          editStartedAfterReadOnly = false;
        }
        activeCount += 1;
        maxActive = Math.max(maxActive, activeCount);
        await sleep(20);
        if (task.type === "analyze") {
          completedReadOnly += 1;
        }
        activeCount -= 1;
        return {
          taskId: task.id,
          status: "DONE",
          output: { content: `${task.type} complete` },
          completedAt: new Date(),
        };
      }),
    };

    const scheduler = new TaskScheduler(taskRepo, executor, {
      concurrencyLimit: 3,
      enforceReadOnlyParallel: true,
      readOnlyTaskTypes: ["analyze"],
    });
    await scheduler.execute("run-parallel");

    expect(executor.execute).toHaveBeenCalledTimes(3);
    expect(maxActive).toBe(2);
    expect(editStartedAfterReadOnly).toBe(true);
  });

  it("keeps mutating tasks serialized when read-only lane has no eligible tasks", async () => {
    const ctx = new MockRuntimeState();
    const taskRepo = new TaskRepository(ctx);
    await taskRepo.create(
      new Task("m2", "run-serial", "edit", "READY", [], {
        description: "Edit one",
      }),
    );
    await taskRepo.create(
      new Task("m3", "run-serial", "shell", "READY", [], {
        description: "Shell two",
      }),
    );

    let activeCount = 0;
    let maxActive = 0;
    const executor = {
      execute: vi.fn(async (task: Task): Promise<TaskResult> => {
        activeCount += 1;
        maxActive = Math.max(maxActive, activeCount);
        await sleep(20);
        activeCount -= 1;
        return {
          taskId: task.id,
          status: "DONE",
          output: { content: `${task.type} complete` },
          completedAt: new Date(),
        };
      }),
    };

    const scheduler = new TaskScheduler(taskRepo, executor, {
      concurrencyLimit: 3,
      enforceReadOnlyParallel: true,
      readOnlyTaskTypes: ["analyze"],
    });
    await scheduler.execute("run-serial");

    expect(executor.execute).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class InMemoryStorage implements RuntimeStorage {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string | string[]): Promise<boolean | number> {
    if (Array.isArray(key)) {
      let deleted = 0;
      for (const entry of key) {
        if (this.store.delete(entry)) {
          deleted += 1;
        }
      }
      return deleted;
    }
    return this.store.delete(key);
  }

  async list<T>(options?: {
    prefix?: string;
    start?: string;
    end?: string;
    limit?: number;
  }): Promise<Map<string, T>> {
    const output = new Map<string, T>();
    const prefix = options?.prefix;
    const start = options?.start;
    const end = options?.end;
    const limit = options?.limit;

    for (const [key, value] of this.store.entries()) {
      if (prefix && !key.startsWith(prefix)) {
        continue;
      }
      if (start && key < start) {
        continue;
      }
      if (end && key >= end) {
        continue;
      }

      output.set(key, value as T);
      if (typeof limit === "number" && output.size >= limit) {
        break;
      }
    }

    return output;
  }
}

class MockRuntimeState implements RuntimeDurableObjectState {
  storage: RuntimeStorage = new InMemoryStorage();

  async blockConcurrencyWhile<T>(closure: () => Promise<T>): Promise<T> {
    return await closure();
  }
}
