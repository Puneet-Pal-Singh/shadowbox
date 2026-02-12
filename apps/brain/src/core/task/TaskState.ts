// apps/brain/src/core/task/TaskState.ts
// Phase 3A: Task state machine utilities and validation

import type { TaskStatus } from "../../types";

export interface TaskStateTransition {
  from: TaskStatus;
  to: TaskStatus;
  timestamp: Date;
  reason?: string;
}

export class TaskState {
  private static readonly VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> =
    {
      PENDING: ["READY", "CANCELLED"],
      READY: ["RUNNING", "BLOCKED", "CANCELLED"],
      RUNNING: ["DONE", "FAILED", "CANCELLED"],
      DONE: [],
      FAILED: ["RETRYING", "CANCELLED"],
      BLOCKED: ["READY", "CANCELLED"],
      CANCELLED: [],
      RETRYING: ["RUNNING"],
    };

  static isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
    return this.VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  static getValidTransitions(status: TaskStatus): TaskStatus[] {
    return this.VALID_TRANSITIONS[status] || [];
  }

  static isTerminal(status: TaskStatus): boolean {
    return ["DONE", "CANCELLED"].includes(status);
  }

  static isActive(status: TaskStatus): boolean {
    return ["PENDING", "READY", "RUNNING", "BLOCKED", "RETRYING"].includes(
      status,
    );
  }

  static canStart(status: TaskStatus): boolean {
    return status === "READY" || status === "RETRYING";
  }

  static getInitialStatus(): TaskStatus {
    return "PENDING";
  }
}

export function validateTaskStateTransition(
  from: TaskStatus,
  to: TaskStatus,
): void {
  if (!TaskState.isValidTransition(from, to)) {
    throw new TaskStateError(
      `Invalid transition from "${from}" to "${to}". ` +
        `Valid transitions from "${from}" are: ${TaskState.getValidTransitions(from).join(", ") || "none (terminal state)"}`,
    );
  }
}

export class TaskStateError extends Error {
  constructor(message: string) {
    super(`[task/state] ${message}`);
    this.name = "TaskStateError";
  }
}

export interface TaskStateSnapshot {
  status: TaskStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  canRetry: boolean;
  isTerminal: boolean;
  validNextStates: TaskStatus[];
}

export function createStateSnapshot(
  status: TaskStatus,
  retryCount: number,
  maxRetries: number,
  createdAt: Date,
  updatedAt: Date,
): TaskStateSnapshot {
  return {
    status,
    retryCount,
    maxRetries,
    createdAt,
    updatedAt,
    canRetry: status === "FAILED" && retryCount < maxRetries,
    isTerminal: TaskState.isTerminal(status),
    validNextStates: TaskState.getValidTransitions(status),
  };
}
