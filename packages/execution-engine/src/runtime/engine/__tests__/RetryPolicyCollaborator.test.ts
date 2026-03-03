import { describe, it, expect } from "vitest";
import { RetryPolicyCollaborator, type RetryContext, type RetryBudget } from "../RetryPolicyCollaborator.js";

/**
 * Tests for RCP5: Retry policy separated from scheduler recursion.
 * 
 * Verifies that:
 * - Retry decisions are policy-driven, not execution-driven
 * - Deterministic errors are never retried
 * - Transient errors are retried within budget constraints
 * - Budgets are enforced (max attempts, max duration)
 * - Backoff is calculated with jitter
 */
describe("RetryPolicyCollaborator - RCP5: Retry Policy Separation", () => {
  const collaborator = new RetryPolicyCollaborator();

  const createBudget = (overrides?: Partial<RetryBudget>): RetryBudget => ({
    maxAttempts: 3,
    maxTotalDurationMs: 10000,
    currentAttempt: 1,
    totalElapsedMs: 0,
    ...overrides,
  });

  const createContext = (overrides?: Partial<RetryContext>): RetryContext => ({
    taskId: "task-1",
    budget: createBudget(),
    ...overrides,
  });

  describe("Error Classification", () => {
    it("should classify invalid input as deterministic", () => {
      const error = { code: "INVALID_INPUT", message: "Bad input" };
      const result = collaborator.classifyError(error);

      expect(result).toBe("deterministic");
    });

    it("should classify authentication failure as deterministic", () => {
      const error = { code: "AUTHENTICATION_FAILED", message: "Invalid token" };
      const result = collaborator.classifyError(error);

      expect(result).toBe("deterministic");
    });

    it("should classify authorization failure as deterministic", () => {
      const error = { code: "AUTHORIZATION_FAILED", message: "Permission denied" };
      const result = collaborator.classifyError(error);

      expect(result).toBe("deterministic");
    });

    it("should classify not found as deterministic", () => {
      const error = { code: "NOT_FOUND", message: "Resource not found" };
      const result = collaborator.classifyError(error);

      expect(result).toBe("deterministic");
    });

    it("should classify network timeout as transient", () => {
      const error = { code: "TIMEOUT", message: "Connection timed out" };
      const result = collaborator.classifyError(error);

      expect(result).toBe("transient");
    });

    it("should classify service unavailable as transient", () => {
      const error = { code: "SERVICE_UNAVAILABLE", message: "Service temporarily down" };
      const result = collaborator.classifyError(error);

      expect(result).toBe("transient");
    });

    it("should classify unknown errors as transient", () => {
      const error = { code: "UNKNOWN", message: "Something went wrong" };
      const result = collaborator.classifyError(error);

      expect(result).toBe("transient");
    });
  });

  describe("Retry Decisions", () => {
    it("should not retry deterministic errors", () => {
      const context = createContext();
      const decision = collaborator.makeRetryDecision(context, "deterministic");

      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe("deterministic_error");
      expect(decision.nextAttemptNumber).toBeUndefined();
    });

    it("should retry transient errors within budget", () => {
      const context = createContext();
      const decision = collaborator.makeRetryDecision(context, "transient");

      expect(decision.shouldRetry).toBe(true);
      expect(decision.reason).toBe("transient_error");
      expect(decision.nextAttemptNumber).toBe(2);
      expect(decision.waitTimeMs).toBeGreaterThan(0);
    });

    it("should not retry when max attempts reached", () => {
      const budget = createBudget({ currentAttempt: 3, maxAttempts: 3 });
      const context = createContext({ budget });
      const decision = collaborator.makeRetryDecision(context, "transient");

      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe("max_attempts_reached");
    });

    it("should not retry when duration budget exhausted", () => {
      const budget = createBudget({
        currentAttempt: 1,
        totalElapsedMs: 10000,
        maxTotalDurationMs: 10000,
      });
      const context = createContext({ budget });
      const decision = collaborator.makeRetryDecision(context, "transient");

      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe("budget_exhausted");
    });

    it("should calculate exponential backoff", () => {
      // First retry after 1st attempt
      const context1 = createContext({ budget: createBudget({ currentAttempt: 1 }) });
      const decision1 = collaborator.makeRetryDecision(context1, "transient");

      // Second retry after 2nd attempt (should be longer)
      const context2 = createContext({ budget: createBudget({ currentAttempt: 2 }) });
      const decision2 = collaborator.makeRetryDecision(context2, "transient");

      expect(decision1.waitTimeMs!).toBeLessThan(decision2.waitTimeMs!);
    });

    it("should cap backoff at maximum", () => {
      const budget = createBudget({ currentAttempt: 2, maxAttempts: 5 });
      const context = createContext({ budget });
      const decision = collaborator.makeRetryDecision(context, "transient");

      // Should retry but backoff should be capped
      expect(decision.shouldRetry).toBe(true);
      expect(decision.waitTimeMs).toBeLessThanOrEqual(5500);
    });
  });

  describe("Budget Updates", () => {
    it("should update attempt count", () => {
      const budget = createBudget({ currentAttempt: 1 });
      const updated = collaborator.updateBudget(budget, 1000);

      expect(updated.currentAttempt).toBe(2);
    });

    it("should accumulate total elapsed time", () => {
      const budget = createBudget({ totalElapsedMs: 2000 });
      const updated = collaborator.updateBudget(budget, 1000);

      expect(updated.totalElapsedMs).toBe(3000);
    });

    it("should not modify original budget", () => {
      const budget = createBudget();
      const updated = collaborator.updateBudget(budget, 1000);

      expect(budget).not.toBe(updated);
      expect(budget.currentAttempt).toBe(1);
    });

    it("should accumulate multiple attempts", () => {
      let budget = createBudget();

      for (let i = 0; i < 3; i++) {
        budget = collaborator.updateBudget(budget, 1000);
      }

      expect(budget.currentAttempt).toBe(4);
      expect(budget.totalElapsedMs).toBe(3000);
    });
  });

  describe("Non-Recursive Retry Flow", () => {
    it("should support explicit loop-based retry (not recursion)", () => {
      const budget = createBudget();
      const context = createContext({ budget: budget });
      let currentBudget = budget;
      const attempts: number[] = [];

      // Explicit loop (not recursive)
      while (currentBudget.currentAttempt <= currentBudget.maxAttempts) {
        attempts.push(currentBudget.currentAttempt);

        const decision = collaborator.makeRetryDecision(context, "transient");
        if (!decision.shouldRetry) {
          break;
        }

        currentBudget = collaborator.updateBudget(currentBudget, 100);
      }

      // Should have tried 3 times (max attempts)
      expect(attempts.length).toBe(3);
      expect(attempts).toEqual([1, 2, 3]);
    });

    it("should stop retrying on deterministic error", () => {
      const budget = createBudget();
      const context = createContext({ budget });
      let currentBudget = budget;
      const attempts: number[] = [];

      while (currentBudget.currentAttempt <= currentBudget.maxAttempts) {
        attempts.push(currentBudget.currentAttempt);

        // First attempt: transient, retry
        // Second attempt: deterministic, stop
        const errorType = attempts.length === 1 ? "transient" : "deterministic";
        const decision = collaborator.makeRetryDecision(context, errorType as any);

        if (!decision.shouldRetry) {
          break;
        }

        currentBudget = collaborator.updateBudget(currentBudget, 100);
      }

      // Should have only tried 2 times (stopped on deterministic error)
      expect(attempts.length).toBe(2);
    });
  });
});
