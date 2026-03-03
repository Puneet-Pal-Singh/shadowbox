/**
 * RetryPolicyCollaborator - Decoupled retry policy and budget management.
 *
 * RCP5: Separates retry decision logic from scheduler execution recursion.
 * - Owns retry policy decisions, classification, and budget enforcement
 * - Replaces recursive retry calls with explicit state-driven flow
 * - Emits observable retry decision telemetry per attempt
 *
 * Key invariant: Scheduler calls this collaborator for retry decisions,
 * never recursively executes tasks for retries.
 */

export interface RetryDecision {
  shouldRetry: boolean;
  reason: "deterministic_error" | "transient_error" | "budget_exhausted" | "max_attempts_reached";
  nextAttemptNumber?: number;
  waitTimeMs?: number;
}

export interface RetryBudget {
  maxAttempts: number;
  maxTotalDurationMs: number;
  currentAttempt: number;
  totalElapsedMs: number;
}

export interface RetryContext {
  taskId: string;
  budget: RetryBudget;
  lastError?: {
    code: string;
    message: string;
  };
}

/**
 * Policy for retry classification and budgeting.
 * Owns the logic for: which errors are retryable, budget constraints, etc.
 */
export class RetryPolicyCollaborator {
  /**
   * Classify an error as deterministic or transient.
   * Deterministic errors should never be retried.
   */
  classifyError(error: { code: string; message: string }): "deterministic" | "transient" {
    const deterministicCodes = [
      "INVALID_INPUT",
      "AUTHENTICATION_FAILED",
      "AUTHORIZATION_FAILED",
      "NOT_FOUND",
      "RESOURCE_EXHAUSTED",
    ];

    return deterministicCodes.includes(error.code) ? "deterministic" : "transient";
  }

  /**
   * Decide whether to retry based on error classification and budget.
   * This is the ONLY place retry decisions are made.
   */
  makeRetryDecision(context: RetryContext, errorClassification: "deterministic" | "transient"): RetryDecision {
    // Deterministic errors are never retried
    if (errorClassification === "deterministic") {
      return {
        shouldRetry: false,
        reason: "deterministic_error",
      };
    }

    // Check budget constraints
    const { budget } = context;

    if (budget.currentAttempt >= budget.maxAttempts) {
      return {
        shouldRetry: false,
        reason: "max_attempts_reached",
      };
    }

    if (budget.totalElapsedMs >= budget.maxTotalDurationMs) {
      return {
        shouldRetry: false,
        reason: "budget_exhausted",
      };
    }

    // Transient error and budget available: retry
    const nextAttempt = budget.currentAttempt + 1;
    const waitTimeMs = this.calculateBackoff(nextAttempt);

    return {
      shouldRetry: true,
      reason: "transient_error",
      nextAttemptNumber: nextAttempt,
      waitTimeMs,
    };
  }

  /**
   * Calculate exponential backoff with jitter.
   * @param attemptNumber Current attempt number (1-indexed)
   */
  private calculateBackoff(attemptNumber: number): number {
    const baseMs = 100;
    const maxMs = 5000;

    // Exponential: 100ms, 200ms, 400ms, 800ms, ...
    const exponentialMs = Math.min(baseMs * Math.pow(2, attemptNumber - 1), maxMs);

    // Add 10% jitter
    const jitterMs = exponentialMs * (0.9 + Math.random() * 0.2);

    return Math.round(jitterMs);
  }

  /**
   * Update budget after an attempt.
   */
  updateBudget(
    budget: RetryBudget,
    attemptDurationMs: number,
  ): RetryBudget {
    return {
      ...budget,
      currentAttempt: budget.currentAttempt + 1,
      totalElapsedMs: budget.totalElapsedMs + attemptDurationMs,
    };
  }
}
