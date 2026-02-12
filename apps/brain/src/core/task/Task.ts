// apps/brain/src/core/task/Task.ts
// Phase 3A: Task entity with state machine transitions

import type {
  TaskType,
  TaskStatus,
  TaskInput,
  TaskOutput,
  TaskError,
} from "../../types";
import { TaskState } from "./TaskState";

export interface SerializedTask {
  id: string;
  runId: string;
  type: TaskType;
  status: TaskStatus;
  dependencies: string[];
  input: TaskInput;
  output?: TaskOutput;
  error?: TaskError;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export class Task {
  constructor(
    readonly id: string,
    readonly runId: string,
    readonly type: TaskType,
    public status: TaskStatus,
    readonly dependencies: string[],
    readonly input: TaskInput,
    public output?: TaskOutput,
    public error?: TaskError,
    public retryCount = 0,
    readonly maxRetries = 3,
    readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date(),
  ) {}

  transition(newStatus: TaskStatus, data?: Partial<Task>): void {
    if (!TaskState.isValidTransition(this.status, newStatus)) {
      throw new InvalidTaskStateTransitionError(this.status, newStatus);
    }

    this.status = newStatus;
    this.updatedAt = new Date();

    if (data) {
      Object.assign(this, data);
    }

    console.log(`[task/entity] Task ${this.id} transitioned to ${newStatus}`);
  }

  canRetry(): boolean {
    return this.retryCount < this.maxRetries && this.status === "FAILED";
  }

  incrementRetry(): void {
    this.retryCount++;
    this.updatedAt = new Date();
  }

  isReady(): boolean {
    return (
      this.status === "READY" ||
      (this.status === "PENDING" && this.dependencies.length === 0)
    );
  }

  isTerminal(): boolean {
    return TaskState.isTerminal(this.status);
  }

  toJSON(): SerializedTask {
    return {
      id: this.id,
      runId: this.runId,
      type: this.type,
      status: this.status,
      dependencies: this.dependencies,
      input: this.input,
      output: this.output,
      error: this.error,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  static fromJSON(data: SerializedTask): Task {
    return new Task(
      data.id,
      data.runId,
      data.type,
      data.status,
      data.dependencies,
      data.input,
      data.output,
      data.error,
      data.retryCount,
      data.maxRetries,
      new Date(data.createdAt),
      new Date(data.updatedAt),
    );
  }
}

export class InvalidTaskStateTransitionError extends Error {
  constructor(from: TaskStatus, to: TaskStatus) {
    super(`[task/state] Invalid transition from ${from} to ${to}`);
    this.name = "InvalidTaskStateTransitionError";
  }
}
