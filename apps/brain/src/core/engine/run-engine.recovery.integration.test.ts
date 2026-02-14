import type { DurableObjectState } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import { DurableObjectStateManager } from "@shadowbox/execution-engine/runtime/state";
import { Run, RunRepository } from "../run";
import { RunRecovery } from "../orchestration";
import { TaskRepository } from "../task";

describe("RunEngine recovery integration", () => {
  let storage: Map<string, unknown>;
  let state: DurableObjectState;
  let runRepo: RunRepository;
  let taskRepo: TaskRepository;
  let stateManager: DurableObjectStateManager;
  let recovery: RunRecovery;

  beforeEach(() => {
    storage = new Map<string, unknown>();
    state = createMockDurableObjectState(storage);
    runRepo = new RunRepository(state);
    taskRepo = new TaskRepository(state);
    stateManager = new DurableObjectStateManager(state, runRepo, taskRepo);
    recovery = new RunRecovery(runRepo, taskRepo);
  });

  it("serializes concurrent task state mutations for the same run", async () => {
    const run = await stateManager.createRun({
      agentId: "coding",
      sessionId: "session-recovery-1",
      prompt: "validate concurrency",
    });
    await stateManager.transitionRun(run.id, "PLANNING");
    await stateManager.transitionRun(run.id, "RUNNING");

    const [task] = await stateManager.createTasks(run.id, [
      { type: "review", description: "single task" },
    ]);
    if (!task) {
      throw new Error("expected task to be created");
    }

    await stateManager.transitionTask(task.id, run.id, "READY");

    await Promise.all([
      stateManager.transitionTask(task.id, run.id, "RUNNING"),
      stateManager.transitionTask(task.id, run.id, "DONE", {
        output: { content: "done" },
      }),
    ]);

    const persisted = await taskRepo.getById(task.id, run.id);
    expect(persisted?.status).toBe("DONE");
  });

  it("resumes running state after restart with incomplete tasks preserved", async () => {
    const run = await stateManager.createRun({
      agentId: "coding",
      sessionId: "session-recovery-2",
      prompt: "resume after restart",
    });
    await stateManager.transitionRun(run.id, "PLANNING");
    await stateManager.transitionRun(run.id, "RUNNING");

    const tasks = await stateManager.createTasks(run.id, [
      { type: "review", description: "task-one" },
      { type: "review", description: "task-two" },
    ]);
    const firstTask = tasks[0];
    const secondTask = tasks[1];
    if (!firstTask || !secondTask) {
      throw new Error("expected tasks to be created");
    }

    await stateManager.transitionTask(firstTask.id, run.id, "READY");
    await stateManager.transitionTask(firstTask.id, run.id, "RUNNING");

    // Simulate DO restart by rebuilding repos/recovery over the same storage.
    const restartedRecovery = new RunRecovery(
      new RunRepository(state),
      new TaskRepository(state),
    );

    const resumedRun = await restartedRecovery.resumeRun(run.id);
    const incompleteTask = await restartedRecovery.findLastIncompleteTask(run.id);

    expect(resumedRun.status).toBe("RUNNING");
    expect(incompleteTask?.id).toBe(secondTask.id);
    expect(incompleteTask?.status).toBe("PENDING");
  });

  it("supports replay-style resume after partial failure", async () => {
    const run = await stateManager.createRun({
      agentId: "coding",
      sessionId: "session-recovery-3",
      prompt: "replay failed task",
    });
    await stateManager.transitionRun(run.id, "PLANNING");
    await stateManager.transitionRun(run.id, "RUNNING");

    const [task] = await stateManager.createTasks(run.id, [
      { type: "review", description: "may fail once" },
    ]);
    if (!task) {
      throw new Error("expected task to be created");
    }

    await stateManager.transitionTask(task.id, run.id, "READY");
    await stateManager.transitionTask(task.id, run.id, "RUNNING");
    await stateManager.transitionTask(task.id, run.id, "FAILED", {
      error: {
        message: "transient failure",
        stack: "trace",
      },
    });

    const failedRun = await runRepo.getById(run.id);
    if (!failedRun) {
      throw new Error("expected run to exist");
    }
    failedRun.transition("FAILED");
    await runRepo.update(failedRun);

    // Simulate replay by restoring run execution and retrying failed task.
    const replayRun = new Run(
      failedRun.id,
      failedRun.sessionId,
      "RUNNING",
      failedRun.agentType,
      failedRun.input,
      failedRun.output,
      failedRun.metadata,
      failedRun.createdAt,
      new Date(),
    );
    await runRepo.update(replayRun);

    const replayTask = await taskRepo.getById(task.id, run.id);
    if (!replayTask) {
      throw new Error("expected replay task to exist");
    }
    replayTask.transition("RETRYING");
    replayTask.transition("RUNNING");
    await taskRepo.update(replayTask);

    const resumedRun = await recovery.resumeRun(run.id);
    const incompleteTask = await recovery.findLastIncompleteTask(run.id);

    expect(resumedRun.status).toBe("RUNNING");
    expect(incompleteTask?.id).toBe(task.id);
    expect(incompleteTask?.status).toBe("RUNNING");
  });
});

function createMockDurableObjectState(
  store: Map<string, unknown>,
): DurableObjectState {
  let queue: Promise<unknown> = Promise.resolve();
  let inCriticalSection = false;

  const runExclusive = <T>(closure: () => Promise<T>): Promise<T> => {
    if (inCriticalSection) {
      return closure();
    }

    const next = queue.then(async () => {
      inCriticalSection = true;
      try {
        return await closure();
      } finally {
        inCriticalSection = false;
      }
    });
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const storage = {
    get: async <T>(key: string): Promise<T | undefined> => store.get(key) as T,
    put: async <T>(key: string, value: T): Promise<void> => {
      store.set(key, value);
    },
    delete: async (key: string | string[]): Promise<boolean | number> => {
      if (Array.isArray(key)) {
        let deleted = 0;
        for (const entry of key) {
          if (store.delete(entry)) {
            deleted += 1;
          }
        }
        return deleted;
      }
      return store.delete(key);
    },
    list: async <T>(options?: { prefix?: string }): Promise<Map<string, T>> => {
      const result = new Map<string, T>();
      for (const [key, value] of store.entries()) {
        if (!options?.prefix || key.startsWith(options.prefix)) {
          result.set(key, value as T);
        }
      }
      return result;
    },
    transaction: async <T>(
      closure: (txn: DurableObjectState["storage"]) => Promise<T>,
    ): Promise<T> => closure(storage as DurableObjectState["storage"]),
    blockConcurrencyWhile: async <T>(closure: () => Promise<T>): Promise<T> =>
      runExclusive(closure),
  };

  return {
    storage: storage as DurableObjectState["storage"],
    id: { toString: () => "mock-recovery-do" } as DurableObjectState["id"],
    waitUntil: async (promise: Promise<unknown>): Promise<void> => {
      await promise;
    },
    blockConcurrencyWhile: async <T>(closure: () => Promise<T>): Promise<T> =>
      runExclusive(closure),
  } as DurableObjectState;
}
