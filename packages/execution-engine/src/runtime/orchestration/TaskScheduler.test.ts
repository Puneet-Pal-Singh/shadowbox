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
});

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
