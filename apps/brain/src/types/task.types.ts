// apps/brain/src/types/task.types.ts
// Phase 3A: Task entity types and state definitions

/**
 * Task Type - Represents different kinds of work units
 */
export type TaskType =
  | "analyze"
  | "edit"
  | "test"
  | "review"
  | "git"
  | "shell"
  | (string & {});

/**
 * Task Status State Machine
 * PENDING → READY → RUNNING → DONE
 *    ↓        ↓        ↓         ↓
 * CANCELLED  BLOCKED  FAILED  (terminal)
 *               ↑         ↓
 *               └──── RETRYING
 */
export type TaskStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "DONE"
  | "FAILED"
  | "BLOCKED"
  | "CANCELLED"
  | "RETRYING";

export interface TaskInput {
  description: string;
  expectedOutput?: string;
  [key: string]: unknown;
}

export interface TaskOutput {
  content: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
}

export interface TaskError {
  message: string;
  code?: string;
  stack?: string;
}

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

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  output?: TaskOutput;
  error?: TaskError;
  completedAt: Date;
}

export interface TaskExecutionContext {
  task: SerializedTask;
  runId: string;
  dependencies: TaskResult[];
}
