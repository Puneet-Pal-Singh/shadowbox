/**
 * Stop Condition Types
 *
 * Defines deterministic stop conditions and evaluation semantics.
 * All types are strict, non-negotiable, and fully documented.
 *
 * Pattern: Discriminated unions for exhaustiveness checking.
 */

/**
 * Represents a single deterministic stop condition.
 * Discriminated union: each variant has its own parameters.
 *
 * Stop conditions must be:
 * - Deterministic (same state → same result)
 * - Evaluatable without LLM (pure logic)
 * - No async I/O
 */
export type StopCondition =
  | {
      /** Stop after X steps executed (regardless of outcome) */
      type: 'max_steps_reached';
      maxSteps: number; // 1-20
    }
  | {
      /** Stop when goal is satisfied (artifact produced or message received) */
      type: 'goal_satisfied';
      goalDescription: string; // what constitutes success
    }
  | {
      /** Stop when specific artifact type is produced */
      type: 'artifact_produced';
      artifactType: string; // e.g., "code", "test", "summary"
    }
  | {
      /** Stop when error count exceeds threshold */
      type: 'error_threshold_exceeded';
      maxErrors: number; // 0-5
    }
  | {
      /** Stop when execution time exceeds limit */
      type: 'timeout_reached';
      maxDurationMs: number; // milliseconds
    }
  | {
      /** Stop due to external signal (user cancel, etc.) */
      type: 'external_abort';
      reason?: string; // optional context
    };

/**
 * Discriminator type for runtime pattern matching
 */
export type StopConditionType =
  | 'max_steps_reached'
  | 'goal_satisfied'
  | 'artifact_produced'
  | 'error_threshold_exceeded'
  | 'timeout_reached'
  | 'external_abort';

/**
 * Hard execution limits (cannot be exceeded under any circumstance)
 */
export interface HardLimits {
  /** Maximum steps to execute (1-20) */
  maxSteps: number;

  /** Maximum errors to tolerate (0-5) */
  maxErrors: number;

  /** Optional: maximum execution duration (milliseconds) */
  maxDurationMs?: number;
}

/**
 * Stop policy for a plan (defines how execution terminates)
 *
 * Every plan must declare:
 * 1. Primary stop condition (preferred way to stop)
 * 2. Fallback stop condition (if primary can't be met)
 * 3. Hard limits (absolute maximum)
 * 4. Priority order (if multiple conditions fire)
 */
export interface StopPolicy {
  /** Primary condition: what we hope triggers first */
  primary: StopCondition;

  /** Fallback condition: what stops if primary fails */
  fallback: StopCondition;

  /** Hard limits: absolute maximum constraints */
  hardLimits: HardLimits;

  /**
   * Optional: explicit priority order for condition resolution.
   * If not provided, default priority is used.
   * Default order:
   * 1. external_abort (highest priority)
   * 2. timeout_reached
   * 3. error_threshold_exceeded
   * 4. goal_satisfied
   * 5. artifact_produced
   * 6. max_steps_reached (lowest priority)
   */
  priorityOrder?: StopConditionType[];
}

/**
 * Current execution state snapshot.
 * Immutable: passed to evaluator for stop condition checking.
 */
export interface ExecutionState {
  // Execution progress
  /** Number of steps started */
  stepsExecuted: number;

  /** Number of steps completed successfully */
  stepsCompleted: number;

  /** Number of errors encountered */
  errorCount: number;

  /** Error messages from execution */
  errorMessages: string[];

  /** Elapsed time since start (milliseconds) */
  durationMs: number;

  /** Timestamp when execution started */
  startedAt: number;

  // Produced artifacts
  /** Artifacts created during execution */
  artifacts: Array<{
    type: string; // e.g., "code", "test", "report"
    id: string; // unique identifier
    content?: string; // optional content summary
  }>;

  /** Output values from steps */
  outputs: Record<string, unknown>;

  // Execution control
  /** Is execution currently active? */
  isRunning: boolean;

  /** Was execution aborted externally? */
  wasAborted: boolean;

  /** Reason for external abort (if any) */
  abortReason?: string;
}

/**
 * Reason why execution stopped (not just "done: true")
 */
export type StopReason =
  | 'COMPLETED_SUCCESS' // primary condition met
  | 'COMPLETED_PARTIAL' // fallback condition met
  | 'FAILED_HARD_LIMIT_STEPS' // exceeded maxSteps
  | 'FAILED_HARD_LIMIT_ERRORS' // exceeded maxErrors
  | 'FAILED_HARD_LIMIT_TIMEOUT' // exceeded maxDurationMs
  | 'FAILED_CONDITION_NOT_MET' // neither primary nor fallback met
  | 'ABORTED_EXTERNAL'; // user or system abort

/**
 * Result of evaluating a stop condition
 */
export interface StopResult {
  /** Should execution stop? */
  shouldStop: boolean;

  /** Why did we reach this conclusion? */
  reason: StopReason;

  /** Priority (for multi-condition resolution, 0=highest) */
  priority: number;

  /** Details for logging, UI, audits */
  details: {
    /** Which condition was evaluated */
    condition: StopCondition;

    /** How long execution has been running */
    executionTime: number;

    /** How many steps completed */
    stepsCompleted: number;

    /** Message for logging */
    message: string;
  };
}

/**
 * Evaluator contract: pure function that checks stop conditions
 */
export interface StopConditionEvaluator {
  /**
   * Evaluate a single stop condition against execution state
   *
   * Guarantees:
   * - Pure function (no side effects)
   * - Deterministic (same inputs → same output)
   * - Stateless
   * - No async I/O
   *
   * @param condition - Stop condition to evaluate
   * @param state - Current execution state (immutable)
   * @returns StopResult with decision and reasoning
   */
  evaluate(condition: StopCondition, state: ExecutionState): StopResult;

  /**
   * Resolve multiple conditions: pick one to act on
   *
   * Used when multiple stop conditions are true.
   * Returns the highest-priority match.
   *
   * @param conditions - Array of conditions to check
   * @param state - Current execution state
   * @param priorityOrder - Custom priority (or default)
   * @returns Single StopResult (highest priority)
   */
  resolveMultiple(
    conditions: StopCondition[],
    state: ExecutionState,
    priorityOrder?: StopConditionType[]
  ): StopResult;

  /**
   * Check if state violates hard limits
   *
   * @param state - Current execution state
   * @param limits - Hard limits to check against
   * @returns true if limits exceeded (must stop)
   */
  exceedsHardLimits(state: ExecutionState, limits: HardLimits): boolean;
}
