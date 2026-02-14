// apps/brain/src/core/state/StateManager.ts
// Phase 3 Enhancement: Centralized state coordination with concurrency control

import type { Run, RunRepository } from "../run/index.js";
import type { Task, TaskRepository } from "../task/index.js";
import type { RunStatus, TaskStatus, TaskResult } from "../types.js";

export interface CreateRunParams {
  agentId: string;
  sessionId: string;
  prompt: string;
  metadata?: Record<string, unknown>;
}

export interface CreateTaskParams {
  type: string;
  description: string;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export interface StateManager {
  /**
   * Create a new run with initial state
   * Wraps in blockConcurrencyWhile
   */
  createRun(params: CreateRunParams): Promise<Run>;

  /**
   * Transition run to new state with validation
   * Wraps in blockConcurrencyWhile
   */
  transitionRun(
    runId: string,
    newState: RunStatus,
    metadata?: Record<string, unknown>,
  ): Promise<Run>;

  /**
   * Create multiple tasks atomically
   * Wraps in blockConcurrencyWhile
   */
  createTasks(runId: string, tasks: CreateTaskParams[]): Promise<Task[]>;

  /**
   * Transition task to new state
   * Wraps in blockConcurrencyWhile
   */
  transitionTask(
    taskId: string,
    runId: string,
    newState: TaskStatus,
    result?: TaskResult,
  ): Promise<Task>;

  /**
   * Get run with all tasks
   */
  getRunWithTasks(runId: string): Promise<{ run: Run; tasks: Task[] }>;

  /**
   * Get tasks ready for execution (dependencies met)
   */
  getReadyTasks(runId: string): Promise<Task[]>;

  /**
   * Cancel run and all pending tasks
   */
  cancelRun(runId: string, reason: string): Promise<Run>;
}
