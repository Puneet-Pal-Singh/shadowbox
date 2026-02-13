// apps/brain/src/core/state/DurableObjectStateManager.ts
// Phase 3 Enhancement: StateManager implementation with Durable Object storage

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { Run, RunRepository } from "../run";
import type { Task, TaskRepository } from "../task";
import type { RunStatus, TaskStatus, TaskResult } from "../../types";
import {
  type StateManager,
  type CreateRunParams,
  type CreateTaskParams,
} from "./StateManager";

/**
 * Generates a unique ID for runs and tasks
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * DurableObjectStateManager - Centralized state coordination
 *
 * Responsibilities:
 * - Centralized state mutations
 * - Concurrency control (blockConcurrencyWhile)
 * - Transaction-like operations
 * - Cross-entity consistency
 */
export class DurableObjectStateManager implements StateManager {
  constructor(
    private storage: DurableObjectState,
    private runRepository: RunRepository,
    private taskRepository: TaskRepository,
  ) {}

  /**
   * Create a new run with initial state
   * Wraps in blockConcurrencyWhile for thread safety
   */
  async createRun(params: CreateRunParams): Promise<Run> {
    return await this.storage.blockConcurrencyWhile(async () => {
      const { Run } = await import("../run");
      const runId = generateId();

      const run = new Run(
        runId,
        params.sessionId,
        "CREATED",
        params.agentId,
        {
          agentType: params.agentId,
          prompt: params.prompt,
          sessionId: params.sessionId,
          metadata: params.metadata,
        },
        undefined,
        { prompt: params.prompt, ...params.metadata },
      );

      await this.runRepository.create(run);
      console.log(
        `[state/manager] Created run ${runId} for agent ${params.agentId}`,
      );
      return run;
    });
  }

  /**
   * Transition run to new state with validation
   * Wraps in blockConcurrencyWhile for thread safety
   */
  async transitionRun(
    runId: string,
    newState: RunStatus,
    metadata?: Record<string, unknown>,
  ): Promise<Run> {
    return await this.storage.blockConcurrencyWhile(async () => {
      const run = await this.runRepository.getById(runId);
      if (!run) {
        throw new StateManagerError(`Run not found: ${runId}`);
      }

      // Validate state transition
      if (!this.isValidRunTransition(run.status, newState)) {
        throw new StateManagerError(
          `Invalid state transition: ${run.status} -> ${newState}`,
        );
      }

      run.transition(newState);

      if (metadata) {
        Object.assign(run.metadata, metadata);
      }

      await this.runRepository.update(run);
      console.log(
        `[state/manager] Transitioned run ${runId}: ${run.status} -> ${newState}`,
      );

      return run;
    });
  }

  /**
   * Create multiple tasks atomically
   * Wraps in blockConcurrencyWhile for thread safety
   */
  async createTasks(
    runId: string,
    taskParams: CreateTaskParams[],
  ): Promise<Task[]> {
    return await this.storage.blockConcurrencyWhile(async () => {
      const run = await this.runRepository.getById(runId);
      if (!run) {
        throw new StateManagerError(`Run not found: ${runId}`);
      }

      const { Task } = await import("../task");
      const tasks: Task[] = [];

      for (const params of taskParams) {
        const taskId = generateId();
        const task = new Task(
          taskId,
          runId,
          params.type,
          "PENDING",
          params.dependencies || [],
          {
            description: params.description,
            ...params.metadata,
          },
        );

        await this.taskRepository.create(task);
        tasks.push(task);
      }

      console.log(
        `[state/manager] Created ${tasks.length} tasks for run ${runId}`,
      );
      return tasks;
    });
  }

  /**
   * Transition task to new state
   * Wraps in blockConcurrencyWhile for thread safety
   */
  async transitionTask(
    taskId: string,
    runId: string,
    newState: TaskStatus,
    result?: TaskResult,
  ): Promise<Task> {
    return await this.storage.blockConcurrencyWhile(async () => {
      const task = await this.taskRepository.getById(taskId, runId);
      if (!task) {
        throw new StateManagerError(`Task not found: ${taskId}`);
      }

      const updateData: {
        output?: typeof task.output;
        error?: typeof task.error;
      } = {};

      if (result) {
        if (result.output) {
          updateData.output = result.output;
        }
        if (result.error) {
          updateData.error = result.error;
        }
      }

      task.transition(newState, updateData);
      await this.taskRepository.update(task);

      console.log(
        `[state/manager] Transitioned task ${taskId}: ${task.status} -> ${newState}`,
      );

      return task;
    });
  }

  /**
   * Get run with all tasks
   */
  async getRunWithTasks(runId: string): Promise<{ run: Run; tasks: Task[] }> {
    const [run, tasks] = await Promise.all([
      this.runRepository.getById(runId),
      this.taskRepository.getByRun(runId),
    ]);

    if (!run) {
      throw new StateManagerError(`Run not found: ${runId}`);
    }

    return { run, tasks };
  }

  /**
   * Get tasks ready for execution (dependencies met)
   * A task is ready when:
   * 1. It's in PENDING state
   * 2. All its dependencies are in DONE state
   */
  async getReadyTasks(runId: string): Promise<Task[]> {
    const tasks = await this.taskRepository.getByRun(runId);

    return tasks.filter((task) => {
      // Task must be pending
      if (task.status !== "PENDING") {
        return false;
      }

      // All dependencies must be completed
      if (task.dependencies && task.dependencies.length > 0) {
        const completedDeps = tasks.filter(
          (t) => task.dependencies!.includes(t.id) && t.status === "DONE",
        );
        return completedDeps.length === task.dependencies.length;
      }

      return true;
    });
  }

  /**
   * Cancel run and all pending tasks
   * Wraps in blockConcurrencyWhile for thread safety
   */
  async cancelRun(runId: string, reason: string): Promise<Run> {
    return await this.storage.blockConcurrencyWhile(async () => {
      // Cancel all pending and running tasks
      const tasks = await this.taskRepository.getByRun(runId);

      for (const task of tasks) {
        if (task.status === "PENDING" || task.status === "RUNNING") {
          task.transition("CANCELLED");
          await this.taskRepository.update(task);
        }
      }

      // Cancel the run
      const run = await this.transitionRun(runId, "CANCELLED", {
        cancelledReason: reason,
        cancelledAt: new Date().toISOString(),
      });

      console.log(`[state/manager] Cancelled run ${runId}: ${reason}`);
      return run;
    });
  }

  /**
   * Validate run state transitions
   */
  private isValidRunTransition(from: RunStatus, to: RunStatus): boolean {
    const validTransitions: Record<RunStatus, RunStatus[]> = {
      CREATED: ["PLANNING", "CANCELLED"],
      PLANNING: ["RUNNING", "FAILED", "CANCELLED"],
      RUNNING: ["COMPLETED", "FAILED", "CANCELLED", "PAUSED"],
      PAUSED: ["RUNNING", "CANCELLED"],
      COMPLETED: [],
      FAILED: ["RUNNING"], // Allow retry
      CANCELLED: ["CREATED"], // Allow restart
    };

    return validTransitions[from]?.includes(to) ?? false;
  }
}

export class StateManagerError extends Error {
  constructor(message: string) {
    super(`[state/manager] ${message}`);
    this.name = "StateManagerError";
  }
}
