/**
 * Canonical orchestrator contracts.
 *
 * These interfaces define the canonical boundary for orchestrator adapters.
 * All orchestrator implementations (execution-engine-v1, cloudflare_agents,
 * temporal, etc.) must implement these contracts.
 *
 * Canonical alignment: Charter 46, Plan 59, Plan 64 CFA1
 */

import type { RunStatus, WorkflowStep } from "./workflow.js";

/**
 * Canonical run state envelope.
 * Returned by orchestrator adapters to describe current run state.
 */
export interface RunStateEnvelope {
  runId: string;
  status: RunStatus;
  createdAt: number;
  updatedAt: number;
  workflowStep?: WorkflowStep;
}

/**
 * Canonical scheduled task envelope.
 * Returned by orchestrator when scheduling next task for execution.
 */
export interface ScheduledTaskEnvelope<TTaskInput = unknown> {
  taskId: string;
  input: TTaskInput;
}

/**
 * RunOrchestratorPort - Canonical orchestrator boundary contract.
 *
 * Owns run lifecycle, scheduling, and deterministic execution ordering.
 * All orchestrator backends must implement this port.
 *
 * Generic over TTaskInput to allow typed task inputs per adapter.
 */
export interface RunOrchestratorPort<TTaskInput = unknown> {
  /**
   * Get the current state of a run.
   *
   * @param runId - Unique run identifier
   * @returns Run state envelope or null if not found
   */
  getRunState(runId: string): Promise<RunStateEnvelope | null>;

  /**
   * Transition a run to a new state.
   *
   * @param runId - Unique run identifier
   * @param newStatus - Target status
   */
  transitionRun(runId: string, newStatus: RunStatus): Promise<void>;

  /**
   * Schedule the next task for execution.
   *
   * @param runId - Unique run identifier
   * @returns Next task envelope or null if none pending
   */
  scheduleNext(
    runId: string,
  ): Promise<ScheduledTaskEnvelope<TTaskInput> | null>;
}
