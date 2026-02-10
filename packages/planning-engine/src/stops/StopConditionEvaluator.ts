/**
 * Stop Condition Evaluator Service
 *
 * Pure function evaluator for deterministic stop conditions.
 * No side effects, no LLM calls, no async I/O.
 *
 * Guarantees:
 * - Deterministic (same state → same result)
 * - Testable with replay
 * - Suitable for audits and reproducibility
 */

import type {
  StopCondition,
  StopConditionType,
  StopPolicy,
  ExecutionState,
  StopResult,
  StopReason,
  HardLimits,
  StopConditionEvaluator,
} from './types.js';

/**
 * Default priority order for stop conditions
 * Used when custom order not specified
 */
const DEFAULT_PRIORITY_ORDER: StopConditionType[] = [
  'external_abort', // highest priority
  'timeout_reached',
  'error_threshold_exceeded',
  'goal_satisfied',
  'artifact_produced',
  'max_steps_reached', // lowest priority
];

/**
 * Standard implementation of StopConditionEvaluator
 */
export class StandardStopConditionEvaluator implements StopConditionEvaluator {
  /**
   * Evaluate a single stop condition
   * Pure function: same inputs → same output
   */
  evaluate(condition: StopCondition, state: ExecutionState): StopResult {
    console.log('[stop-evaluator/evaluate] Evaluating:', condition.type);

    const baseTime = state.startedAt;
    const executionTime = state.durationMs;

    let shouldStop = false;
    let reason: StopReason = 'COMPLETED_SUCCESS'; // default
    let message = '';

    // Evaluate each condition type
    switch (condition.type) {
      case 'max_steps_reached': {
        shouldStop = state.stepsExecuted >= condition.maxSteps;
        if (shouldStop) {
          reason = 'COMPLETED_PARTIAL';
          message = `Reached max steps (${state.stepsExecuted}/${condition.maxSteps})`;
        }
        break;
      }

      case 'goal_satisfied': {
        // Goal satisfied: check if artifacts exist or outputs have been produced
        const hasArtifacts = state.artifacts.length > 0;
        const hasOutputs = Object.keys(state.outputs).length > 0;
        shouldStop = hasArtifacts || hasOutputs;
        if (shouldStop) {
          reason = 'COMPLETED_SUCCESS';
          message = `Goal satisfied: ${condition.goalDescription}`;
        } else {
          reason = 'FAILED_CONDITION_NOT_MET';
          message = `Goal not satisfied: ${condition.goalDescription}`;
        }
        break;
      }

      case 'artifact_produced': {
        // Check if artifact of specific type exists
        const produced = state.artifacts.some(
          (a) => a.type === condition.artifactType
        );
        shouldStop = produced;
        if (shouldStop) {
          reason = 'COMPLETED_SUCCESS';
          message = `Artifact produced: ${condition.artifactType}`;
        } else {
          reason = 'FAILED_CONDITION_NOT_MET';
          message = `Artifact not produced: ${condition.artifactType}`;
        }
        break;
      }

      case 'error_threshold_exceeded': {
        shouldStop = state.errorCount >= condition.maxErrors;
        if (shouldStop) {
          reason = 'FAILED_HARD_LIMIT_ERRORS';
          message = `Error threshold exceeded (${state.errorCount}/${condition.maxErrors})`;
        }
        break;
      }

      case 'timeout_reached': {
        shouldStop = state.durationMs >= condition.maxDurationMs;
        if (shouldStop) {
          reason = 'FAILED_HARD_LIMIT_TIMEOUT';
          message = `Timeout reached (${state.durationMs}ms/${condition.maxDurationMs}ms)`;
        }
        break;
      }

      case 'external_abort': {
        shouldStop = state.wasAborted;
        if (shouldStop) {
          reason = 'ABORTED_EXTERNAL';
          message = `Aborted externally: ${state.abortReason || condition.reason || 'unknown'}`;
        }
        break;
      }
    }

    // Get priority for this condition (lower = higher priority)
    const priority = DEFAULT_PRIORITY_ORDER.indexOf(condition.type);

    return {
      shouldStop,
      reason,
      priority,
      details: {
        condition,
        executionTime,
        stepsCompleted: state.stepsCompleted,
        message,
      },
    };
  }

  /**
   * Resolve multiple stop conditions
   * Returns highest-priority match
   */
  resolveMultiple(
    conditions: StopCondition[],
    state: ExecutionState,
    priorityOrder: StopConditionType[] = DEFAULT_PRIORITY_ORDER
  ): StopResult {
    console.log(`[stop-evaluator/resolveMultiple] Resolving ${conditions.length} conditions`);

    // Evaluate all conditions
    const results = conditions.map((cond) => this.evaluate(cond, state));

    // Filter to those that trigger (shouldStop = true)
    const triggered = results.filter((r) => r.shouldStop);

    if (triggered.length === 0) {
      // None triggered: return generic "not done"
      return {
        shouldStop: false,
        reason: 'FAILED_CONDITION_NOT_MET',
        priority: priorityOrder.length, // lowest
        details: {
          condition: conditions[0] || { type: 'external_abort' as const },
          executionTime: state.durationMs,
          stepsCompleted: state.stepsCompleted,
          message: 'No stop conditions triggered',
        },
      };
    }

    // Sort by priority (lower index = higher priority)
    const sorted = triggered.sort((a, b) => a.priority - b.priority);

    // sorted[0] guaranteed to exist because triggered.length > 0 (checked above)
    const highestPriority = sorted[0]!;

    console.log(
      `[stop-evaluator/resolveMultiple] ${triggered.length} conditions triggered, highest priority: ${highestPriority.details.condition.type}`
    );

    return highestPriority;
  }

  /**
   * Check if state violates hard limits
   * Pure function: deterministic
   */
  exceedsHardLimits(state: ExecutionState, limits: HardLimits): boolean {
    console.log('[stop-evaluator/exceedsHardLimits] Checking limits');

    // Check maxSteps
    if (state.stepsExecuted > limits.maxSteps) {
      console.warn(
        `[stop-evaluator/exceedsHardLimits] Exceeded maxSteps: ${state.stepsExecuted} > ${limits.maxSteps}`
      );
      return true;
    }

    // Check maxErrors
    if (state.errorCount > limits.maxErrors) {
      console.warn(
        `[stop-evaluator/exceedsHardLimits] Exceeded maxErrors: ${state.errorCount} > ${limits.maxErrors}`
      );
      return true;
    }

    // Check maxDurationMs (if specified)
    if (limits.maxDurationMs && state.durationMs > limits.maxDurationMs) {
      console.warn(
        `[stop-evaluator/exceedsHardLimits] Exceeded maxDurationMs: ${state.durationMs} > ${limits.maxDurationMs}`
      );
      return true;
    }

    return false;
  }
}

/**
 * Singleton evaluator instance
 */
export const stopEvaluator = new StandardStopConditionEvaluator();

/**
 * Helper: get priority of a condition type
 */
export function getPriority(
  conditionType: StopConditionType,
  priorityOrder: StopConditionType[] = DEFAULT_PRIORITY_ORDER
): number {
  const idx = priorityOrder.indexOf(conditionType);
  return idx === -1 ? priorityOrder.length : idx;
}

/**
 * Helper: evaluate a stop policy against execution state
 * Checks primary, then fallback
 */
export function evaluateStopPolicy(
  policy: StopPolicy,
  state: ExecutionState
): StopResult {
  console.log('[stop-evaluator/evaluateStopPolicy] Evaluating policy');

  // First check hard limits
  if (stopEvaluator.exceedsHardLimits(state, policy.hardLimits)) {
    // Determine which limit was exceeded
    let reason: StopReason = 'FAILED_HARD_LIMIT_STEPS';
    let message = 'Hard limit exceeded';

    if (state.stepsExecuted > policy.hardLimits.maxSteps) {
      reason = 'FAILED_HARD_LIMIT_STEPS';
      message = `Steps exceeded: ${state.stepsExecuted} > ${policy.hardLimits.maxSteps}`;
    } else if (state.errorCount > policy.hardLimits.maxErrors) {
      reason = 'FAILED_HARD_LIMIT_ERRORS';
      message = `Errors exceeded: ${state.errorCount} > ${policy.hardLimits.maxErrors}`;
    } else if (
      policy.hardLimits.maxDurationMs &&
      state.durationMs > policy.hardLimits.maxDurationMs
    ) {
      reason = 'FAILED_HARD_LIMIT_TIMEOUT';
      message = `Duration exceeded: ${state.durationMs} > ${policy.hardLimits.maxDurationMs}`;
    }

    return {
      shouldStop: true,
      reason,
      priority: 0, // highest priority
      details: {
        condition: policy.primary,
        executionTime: state.durationMs,
        stepsCompleted: state.stepsCompleted,
        message,
      },
    };
  }

  // Check primary condition
  const primaryResult = stopEvaluator.evaluate(policy.primary, state);
  if (primaryResult.shouldStop) {
    return primaryResult;
  }

  // Check fallback condition
  const fallbackResult = stopEvaluator.evaluate(policy.fallback, state);
  if (fallbackResult.shouldStop) {
    // Fallback triggered: reason is COMPLETED_PARTIAL
    fallbackResult.reason = 'COMPLETED_PARTIAL';
    return fallbackResult;
  }

  // Neither condition met
  return {
    shouldStop: false,
    reason: 'FAILED_CONDITION_NOT_MET',
    priority: DEFAULT_PRIORITY_ORDER.length,
    details: {
      condition: policy.primary,
      executionTime: state.durationMs,
      stepsCompleted: state.stepsCompleted,
      message: 'No stop conditions met',
    },
  };
}
