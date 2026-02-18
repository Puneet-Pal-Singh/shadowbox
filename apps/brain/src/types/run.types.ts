// apps/brain/src/types/run.types.ts
// ⚠️ DEPRECATED: Use @shadowbox/execution-engine/runtime types instead
// This file is kept for backward compatibility only and will be removed in M2.0

import type {
  RunStatus as CanonicalRunStatus,
  AgentType as CanonicalAgentType,
  RunInput as CanonicalRunInput,
  RunOutput as CanonicalRunOutput,
  RunMetadata as CanonicalRunMetadata,
  SerializedRun as CanonicalSerializedRun,
  TaskResult as CanonicalTaskResult,
} from "@shadowbox/execution-engine/runtime";

/**
 * @deprecated Use RunStatus from @shadowbox/execution-engine/runtime instead
 */
export type RunStatus = CanonicalRunStatus;

/**
 * @deprecated Use AgentType from @shadowbox/execution-engine/runtime instead
 */
export type AgentType = CanonicalAgentType;

/**
 * @deprecated Use RunInput from @shadowbox/execution-engine/runtime instead
 * NOTE: This is an identity re-export of the canonical type and has all the same fields.
 * Prefer importing directly from @shadowbox/execution-engine/runtime.
 */
export interface RunInput extends CanonicalRunInput {}

/**
 * @deprecated Use RunOutput from @shadowbox/execution-engine/runtime instead
 */
export interface RunOutput extends CanonicalRunOutput {}

/**
 * @deprecated Use RunMetadata from @shadowbox/execution-engine/runtime instead
 */
export interface RunMetadata extends CanonicalRunMetadata {}

/**
 * @deprecated Use SerializedRun from @shadowbox/execution-engine/runtime instead
 */
export interface SerializedRun extends CanonicalSerializedRun {}

/**
 * @deprecated This local type is not part of the canonical execution-engine types.
 * Consider using TaskResult or removing this dependency.
 */
export interface RunResult {
  runId: string;
  status: RunStatus;
  taskCount: number;
  finalOutput?: string;
  cost: CostSnapshot;
}

/**
 * @deprecated This local type is not part of the canonical execution-engine types.
 * Consider using cost tracking from execution-engine instead.
 */
export interface CostSnapshot {
  runId: string;
  totalCost: number;
  totalTokens: number;
  byModel: Record<string, ModelCost>;
}

/**
 * @deprecated This local type is not part of the canonical execution-engine types.
 */
export interface ModelCost {
  model: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

/**
 * @deprecated This local type is not part of the canonical execution-engine types.
 * Consider using SerializedTask from execution-engine instead.
 */
export interface TaskSummary {
  taskId: string;
  type: string;
  status: string;
}

/**
 * @deprecated This local type is not part of the canonical execution-engine types.
 * Consider using TokenUsage from execution-engine cost types instead.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  model: string;
}
