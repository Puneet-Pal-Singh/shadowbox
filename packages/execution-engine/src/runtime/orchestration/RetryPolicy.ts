// apps/brain/src/core/orchestration/RetryPolicy.ts
// Phase 3C: Retry logic with exponential backoff

import type { Task } from "../task/index.js";

export interface IRetryPolicy {
  shouldRetry(task: Task, attempt: number): boolean;
  getBackoffDelay(attempt: number): number;
}

export interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  backoffMultiplier?: number;
}

/**
 * RetryPolicy manages task retry logic with exponential backoff.
 * Default: max 3 retries, 1s base delay, 2x multiplier
 */
export class RetryPolicy implements IRetryPolicy {
  private maxRetries: number;
  private baseDelayMs: number;
  private backoffMultiplier: number;

  constructor(config: RetryConfig = {}) {
    this.maxRetries = config.maxRetries ?? 3;
    this.baseDelayMs = config.baseDelayMs ?? 1000;
    this.backoffMultiplier = config.backoffMultiplier ?? 2;

    if (this.maxRetries < 0) {
      throw new Error("maxRetries must be non-negative");
    }
    if (this.baseDelayMs < 0) {
      throw new Error("baseDelayMs must be non-negative");
    }
    if (this.backoffMultiplier < 1) {
      throw new Error("backoffMultiplier must be >= 1");
    }
  }

  /**
   * Determine if a task should be retried
   * @param task The task that failed
   * @param attempt Current attempt number (1-based)
   * @returns true if task should be retried, false otherwise
   */
  shouldRetry(task: Task, attempt: number): boolean {
    // Check if we've exceeded max retries
    if (attempt > this.maxRetries) {
      return false;
    }

    // Check if task has exceeded retry count
    if (task.retryCount >= this.maxRetries) {
      return false;
    }

    // Task can be retried
    return true;
  }

  /**
   * Calculate backoff delay for exponential backoff
   * delay = baseDelayMs * (backoffMultiplier ^ (attempt - 1))
   * @param attempt Current attempt number (1-based)
   * @returns Delay in milliseconds
   */
  getBackoffDelay(attempt: number): number {
    if (attempt <= 0) {
      return 0;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, ...
    const exponent = attempt - 1;
    return this.baseDelayMs * Math.pow(this.backoffMultiplier, exponent);
  }

  /**
   * Sleep for the specified delay (for testing/explicit use)
   */
  async sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export class RetryPolicyError extends Error {
  constructor(message: string) {
    super(`[retry/policy] ${message}`);
    this.name = "RetryPolicyError";
  }
}
