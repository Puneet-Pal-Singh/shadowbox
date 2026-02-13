// apps/brain/tests/integration/fixtures/mock-services.ts
// Integration test fixtures and mocks

import type {
  DurableObjectStorage,
  DurableObjectTransaction,
} from "@cloudflare/workers-types";
import type { Task } from "../../../src/core/task";
import type {
  IAgent,
  AgentCapability,
  ExecutionContext,
  TaskResult,
} from "../../../src/types";
import type { Plan } from "../../../src/core/planner";

/**
 * Mock DurableObjectStorage for integration tests
 * Implements the minimal interface needed for tests
 */
export class MockStorage implements Partial<DurableObjectStorage> {
  private data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async list<T>(options?: {
    start?: string;
    end?: string;
    reverse?: boolean;
    limit?: number;
  }): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    for (const [key, value] of this.data) {
      if (options?.start && key < options.start) continue;
      if (options?.end && key > options.end) continue;
      result.set(key, value as T);
    }
    return result;
  }

  async transaction<T>(
    closure: (txn: DurableObjectTransaction) => Promise<T>,
  ): Promise<T> {
    return closure({} as unknown as DurableObjectTransaction);
  }

  async blockConcurrencyWhile<T>(closure: () => Promise<T>): Promise<T> {
    return await closure();
  }
}

/**
 * Test task executor that completes tasks immediately
 */
export interface TaskExecutorCallbacks {
  onTaskStart?: (id: string) => void;
  onTaskComplete?: (id: string) => void;
}

export class TestTaskExecutor {
  constructor(private callbacks?: TaskExecutorCallbacks) {}

  async execute(task: Task, _context: ExecutionContext): Promise<TaskResult> {
    this.callbacks?.onTaskStart?.(task.id);

    // Simulate minimal work
    await new Promise((resolve) => setTimeout(resolve, 10));

    this.callbacks?.onTaskComplete?.(task.id);

    return {
      taskId: task.id,
      status: "DONE",
      output: {
        content: `Completed: ${task.type}`,
      },
      completedAt: new Date(),
    };
  }
}

/**
 * Task executor that fails after N tasks
 */
export class FailingTaskExecutor {
  private executed = 0;

  constructor(private options: { failAfter: number }) {}

  async execute(task: Task): Promise<TaskResult> {
    this.executed++;

    if (this.executed > this.options.failAfter) {
      return {
        taskId: task.id,
        status: "FAILED",
        error: {
          message: "Simulated task failure",
          code: "SIMULATED_ERROR",
        },
        completedAt: new Date(),
      };
    }

    return {
      taskId: task.id,
      status: "DONE",
      output: {
        content: "Success",
      },
      completedAt: new Date(),
    };
  }
}

/**
 * Task executor that fails N times then succeeds (for retry testing)
 */
export class RetryTestExecutor {
  private attempts = new Map<string, number>();

  constructor(private failCount: number) {}

  async execute(task: Task): Promise<TaskResult> {
    const attempts = (this.attempts.get(task.id) || 0) + 1;
    this.attempts.set(task.id, attempts);

    if (attempts <= this.failCount) {
      return {
        taskId: task.id,
        status: "FAILED",
        error: {
          message: `Attempt ${attempts} failed`,
          code: "RETRYABLE_ERROR",
        },
        completedAt: new Date(),
      };
    }

    return {
      taskId: task.id,
      status: "DONE",
      output: {
        content: `Success after ${attempts} attempts`,
      },
      completedAt: new Date(),
    };
  }
}

/**
 * Test agent implementation
 */
export class TestAgent implements IAgent {
  readonly type = "test";

  constructor(private agentId: string) {}

  async plan(): Promise<Plan> {
    return {
      tasks: [
        {
          id: `task-${Date.now()}`,
          type: "test",
          description: "Test task",
          dependsOn: [],
        },
      ],
      metadata: {
        estimatedSteps: 1,
      },
    };
  }

  async executeTask(
    task: Task,
    _context: ExecutionContext,
  ): Promise<TaskResult> {
    return {
      taskId: task.id,
      status: "DONE",
      output: {
        content: `Agent ${this.agentId} executed ${task.type}`,
      },
      completedAt: new Date(),
    };
  }

  async synthesize(): Promise<string> {
    return `Synthesis from ${this.agentId}`;
  }

  getCapabilities(): AgentCapability[] {
    return [
      { name: "code", description: "Code execution" },
      { name: "analyze", description: "Analysis" },
      { name: "test", description: "Testing" },
    ];
  }
}
