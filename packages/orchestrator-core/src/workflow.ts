/**
 * Canonical orchestration workflow vocabulary.
 *
 * These types are the single source of truth for run lifecycle states,
 * orchestrator backend identifiers, and workflow step semantics.
 *
 * Canonical alignment: Charter 46, Plan 59, Plan 64 CFA1
 */

export const RUN_STATUSES = {
  CREATED: "CREATED",
  PLANNING: "PLANNING",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type RunStatus = (typeof RUN_STATUSES)[keyof typeof RUN_STATUSES];

export const ORCHESTRATOR_BACKENDS = {
  EXECUTION_ENGINE_V1: "execution-engine-v1",
  CLOUDFLARE_AGENTS: "cloudflare_agents",
} as const;

export type OrchestratorBackend =
  (typeof ORCHESTRATOR_BACKENDS)[keyof typeof ORCHESTRATOR_BACKENDS];

export const WORKFLOW_STEPS = {
  PLANNING: "planning",
  EXECUTION: "execution",
  SYNTHESIS: "synthesis",
} as const;

export type WorkflowStep =
  (typeof WORKFLOW_STEPS)[keyof typeof WORKFLOW_STEPS];

export const CANONICAL_RUN_LIFECYCLE_STEPS = Object.freeze({
  RUN_CREATED: "RUN_CREATED",
  CONTEXT_PREPARED: "CONTEXT_PREPARED",
  PLAN_VALIDATED: "PLAN_VALIDATED",
  TASK_EXECUTING: "TASK_EXECUTING",
  APPROVAL_WAIT: "APPROVAL_WAIT",
  SYNTHESIS: "SYNTHESIS",
  TERMINAL: "TERMINAL",
} as const);

export type CanonicalRunLifecycleStep =
  (typeof CANONICAL_RUN_LIFECYCLE_STEPS)[keyof typeof CANONICAL_RUN_LIFECYCLE_STEPS];
