// apps/brain/src/types/task.types.ts
// ⚠️ DEPRECATED: Use @shadowbox/execution-engine/runtime types instead
// This file is kept for backward compatibility only and will be removed in M2.0

import type {
  TaskType as CanonicalTaskType,
  TaskStatus as CanonicalTaskStatus,
  TaskInput as CanonicalTaskInput,
  TaskOutput as CanonicalTaskOutput,
  TaskError as CanonicalTaskError,
  SerializedTask as CanonicalSerializedTask,
  TaskResult as CanonicalTaskResult,
  ExecutionContext as CanonicalExecutionContext,
  SynthesisContext as CanonicalSynthesisContext,
  AgentCapability as CanonicalAgentCapability,
  IAgent as CanonicalIAgent,
  IAgentRegistry as CanonicalIAgentRegistry,
} from "@shadowbox/execution-engine/runtime";

/**
 * @deprecated Use TaskType from @shadowbox/execution-engine/runtime instead
 */
export type TaskType = CanonicalTaskType;

/**
 * @deprecated Use TaskStatus from @shadowbox/execution-engine/runtime instead
 */
export type TaskStatus = CanonicalTaskStatus;

/**
 * @deprecated Use TaskInput from @shadowbox/execution-engine/runtime instead
 */
export interface TaskInput extends CanonicalTaskInput {}

/**
 * @deprecated Use TaskOutput from @shadowbox/execution-engine/runtime instead
 */
export interface TaskOutput extends CanonicalTaskOutput {}

/**
 * @deprecated Use TaskError from @shadowbox/execution-engine/runtime instead
 */
export interface TaskError extends CanonicalTaskError {}

/**
 * @deprecated Use SerializedTask from @shadowbox/execution-engine/runtime instead
 */
export interface SerializedTask extends CanonicalSerializedTask {}

/**
 * @deprecated Use TaskResult from @shadowbox/execution-engine/runtime instead
 */
export interface TaskResult extends CanonicalTaskResult {}

/**
 * @deprecated Use ExecutionContext from @shadowbox/execution-engine/runtime instead
 * NOTE: Canonical ExecutionContext includes providerId and modelId fields that
 * this local type lacks. Migrate to canonical type to enable provider/model overrides.
 */
export interface ExecutionContext extends CanonicalExecutionContext {}

/**
 * @deprecated Use SynthesisContext from @shadowbox/execution-engine/runtime instead
 * NOTE: Canonical SynthesisContext includes providerId and modelId fields that
 * this local type lacks. Migrate to canonical type to enable provider/model overrides.
 */
export interface SynthesisContext extends CanonicalSynthesisContext {}

/**
 * @deprecated Use AgentCapability from @shadowbox/execution-engine/runtime instead
 */
export interface AgentCapability extends CanonicalAgentCapability {}

/**
 * @deprecated Use IAgent from @shadowbox/execution-engine/runtime instead
 */
export interface IAgent extends CanonicalIAgent {}

/**
 * @deprecated Use IAgentRegistry from @shadowbox/execution-engine/runtime instead
 */
export interface IAgentRegistry extends CanonicalIAgentRegistry {}

/**
 * @deprecated Use TaskExecutionContext from @shadowbox/execution-engine/runtime instead.
 * This local type is redundant with the canonical ExecutionContext.
 */
export interface TaskExecutionContext {
  task: SerializedTask;
  runId: string;
  dependencies: TaskResult[];
}

/**
 * @deprecated Use PlanContext from @shadowbox/execution-engine/planner instead
 */
export interface PlanContext {
  run: unknown;
  prompt: string;
  history?: unknown;
}
