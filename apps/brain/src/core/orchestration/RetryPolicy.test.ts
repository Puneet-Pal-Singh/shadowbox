// apps/brain/src/core/orchestration/RetryPolicy.test.ts

import { describe, it, expect } from "vitest";
import { RetryPolicy } from "./RetryPolicy";
import { Task } from "../task";

describe("RetryPolicy", () => {
  describe("constructor", () => {
    it("should use default values", () => {
      const policy = new RetryPolicy();
      expect(policy.getBackoffDelay(1)).toBe(1000);
    });

    it("should accept custom config", () => {
      const policy = new RetryPolicy({
        maxRetries: 5,
        baseDelayMs: 500,
        backoffMultiplier: 3,
      });
      expect(policy.getBackoffDelay(1)).toBe(500);
      expect(policy.getBackoffDelay(2)).toBe(1500); // 500 * 3
    });

    it("should reject invalid maxRetries", () => {
      expect(() => new RetryPolicy({ maxRetries: -1 })).toThrow();
    });

    it("should reject invalid baseDelayMs", () => {
      expect(() => new RetryPolicy({ baseDelayMs: -100 })).toThrow();
    });

    it("should reject invalid backoffMultiplier", () => {
      expect(() => new RetryPolicy({ backoffMultiplier: 0.5 })).toThrow();
    });
  });

  describe("shouldRetry", () => {
    it("should allow retry within limit", () => {
      const policy = new RetryPolicy({ maxRetries: 3 });
      const task = new Task("1", "run1", "analyze", "FAILED", []);
      task.retryCount = 0;

      expect(policy.shouldRetry(task, 1)).toBe(true);
      expect(policy.shouldRetry(task, 2)).toBe(true);
      expect(policy.shouldRetry(task, 3)).toBe(true);
    });

    it("should reject retry exceeding max", () => {
      const policy = new RetryPolicy({ maxRetries: 3 });
      const task = new Task("1", "run1", "analyze", "FAILED", []);
      task.retryCount = 3;

      expect(policy.shouldRetry(task, 4)).toBe(false);
    });

    it("should reject retry when task retryCount exceeded", () => {
      const policy = new RetryPolicy({ maxRetries: 2 });
      const task = new Task("1", "run1", "analyze", "FAILED", []);
      task.retryCount = 2;

      expect(policy.shouldRetry(task, 1)).toBe(false);
    });

    it("should allow max retries exactly", () => {
      const policy = new RetryPolicy({ maxRetries: 1 });
      const task = new Task("1", "run1", "analyze", "FAILED", []);
      task.retryCount = 0;

      expect(policy.shouldRetry(task, 1)).toBe(true);
      expect(policy.shouldRetry(task, 2)).toBe(false);
    });
  });

  describe("getBackoffDelay", () => {
    it("should calculate exponential backoff with default config", () => {
      const policy = new RetryPolicy();

      expect(policy.getBackoffDelay(1)).toBe(1000); // 1000 * 2^0
      expect(policy.getBackoffDelay(2)).toBe(2000); // 1000 * 2^1
      expect(policy.getBackoffDelay(3)).toBe(4000); // 1000 * 2^2
      expect(policy.getBackoffDelay(4)).toBe(8000); // 1000 * 2^3
    });

    it("should calculate with custom multiplier", () => {
      const policy = new RetryPolicy({ backoffMultiplier: 3 });

      expect(policy.getBackoffDelay(1)).toBe(1000); // 1000 * 3^0
      expect(policy.getBackoffDelay(2)).toBe(3000); // 1000 * 3^1
      expect(policy.getBackoffDelay(3)).toBe(9000); // 1000 * 3^2
    });

    it("should calculate with custom base delay", () => {
      const policy = new RetryPolicy({ baseDelayMs: 500, backoffMultiplier: 2 });

      expect(policy.getBackoffDelay(1)).toBe(500); // 500 * 2^0
      expect(policy.getBackoffDelay(2)).toBe(1000); // 500 * 2^1
      expect(policy.getBackoffDelay(3)).toBe(2000); // 500 * 2^2
    });

    it("should return 0 for invalid attempt number", () => {
      const policy = new RetryPolicy();
      expect(policy.getBackoffDelay(0)).toBe(0);
      expect(policy.getBackoffDelay(-1)).toBe(0);
    });

    it("should handle no backoff (multiplier = 1)", () => {
      const policy = new RetryPolicy({ backoffMultiplier: 1 });

      expect(policy.getBackoffDelay(1)).toBe(1000);
      expect(policy.getBackoffDelay(2)).toBe(1000);
      expect(policy.getBackoffDelay(3)).toBe(1000);
    });
  });

  describe("sleep", () => {
    it("should sleep for specified delay", async () => {
      const policy = new RetryPolicy();
      const start = Date.now();

      await policy.sleep(100);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95); // Allow 5ms variance
      expect(elapsed).toBeLessThan(200);
    });

    it("should sleep for 0 delay", async () => {
      const policy = new RetryPolicy();

      await policy.sleep(0);
      // Should complete immediately
    });
  });
});
