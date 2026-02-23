/**
 * ByokRateLimiter Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ByokRateLimiter } from "./ByokRateLimiter";

describe("ByokRateLimiter", () => {
  let limiter: ByokRateLimiter;

  beforeEach(() => {
    limiter = new ByokRateLimiter();
  });

  describe("checkLimit", () => {
    it("should allow operations within limit", async () => {
      const result = await limiter.checkLimit(
        "connect",
        "user-1",
        "ws-1"
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it("should enforce connect rate limit (10/min)", async () => {
      // Consume 10 tokens quickly
      for (let i = 0; i < 10; i++) {
        const result = await limiter.checkLimit("connect", "user-1", "ws-1");
        expect(result.allowed).toBe(true);
      }

      // 11th should be rate limited
      const result = await limiter.checkLimit("connect", "user-1", "ws-1");
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("should enforce validate rate limit (30/min)", async () => {
      // Consume 30 tokens
      for (let i = 0; i < 30; i++) {
        const result = await limiter.checkLimit("validate", "user-1", "ws-1");
        expect(result.allowed).toBe(true);
      }

      // 31st should be rate limited
      const result = await limiter.checkLimit("validate", "user-1", "ws-1");
      expect(result.allowed).toBe(false);
    });

    it("should enforce resolve rate limit (300/min)", async () => {
      // Consume 300 tokens
      for (let i = 0; i < 300; i++) {
        const result = await limiter.checkLimit("resolve", "user-1", "ws-1");
        expect(result.allowed).toBe(true);
      }

      // 301st should be rate limited
      const result = await limiter.checkLimit("resolve", "user-1", "ws-1");
      expect(result.allowed).toBe(false);
    });

    it("should isolate limits per user", async () => {
      // User 1 consumes all connect tokens
      for (let i = 0; i < 10; i++) {
        await limiter.checkLimit("connect", "user-1", "ws-1");
      }

      // User 2 should still be able to connect
      const result = await limiter.checkLimit("connect", "user-2", "ws-1");
      expect(result.allowed).toBe(true);
    });

    it("should isolate limits per workspace", async () => {
      // Workspace 1 consumes all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.checkLimit("connect", "user-1", "ws-1");
      }

      // Same user, different workspace should succeed
      const result = await limiter.checkLimit("connect", "user-1", "ws-2");
      expect(result.allowed).toBe(true);
    });

    it("should isolate limits per operation", async () => {
      // Consume connect limit
      for (let i = 0; i < 10; i++) {
        await limiter.checkLimit("connect", "user-1", "ws-1");
      }

      // Validate should still work
      const result = await limiter.checkLimit("validate", "user-1", "ws-1");
      expect(result.allowed).toBe(true);
    });

    it("should include provider in bucket key when provided", async () => {
      // Consume tokens for openai
      for (let i = 0; i < 10; i++) {
        await limiter.checkLimit("connect", "user-1", "ws-1", "openai");
      }

      // Different provider should succeed
      const result = await limiter.checkLimit(
        "connect",
        "user-1",
        "ws-1",
        "anthropic"
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("getRemainingTokens", () => {
    it("should report remaining tokens", async () => {
      const initial = limiter.getRemainingTokens(
        "connect",
        "user-1",
        "ws-1"
      );

      expect(initial).toBeGreaterThan(0);

      // Consume one token
      await limiter.checkLimit("connect", "user-1", "ws-1");

      const remaining = limiter.getRemainingTokens(
        "connect",
        "user-1",
        "ws-1"
      );

      expect(remaining).toBeLessThan(initial);
    });

    it("should report full capacity for new user", async () => {
      const remaining = limiter.getRemainingTokens(
        "connect",
        "new-user",
        "ws-1"
      );

      // Should be at burst capacity (15 for connect)
      expect(remaining).toBe(15);
    });
  });

  describe("resetUserLimits", () => {
    it("should reset all limits for user", async () => {
      // Consume tokens
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit("connect", "user-1", "ws-1");
      }

      let remaining = limiter.getRemainingTokens("connect", "user-1", "ws-1");
      expect(remaining).toBeLessThan(15);

      // Reset
      limiter.resetUserLimits("user-1", "ws-1");

      // Check restored
      remaining = limiter.getRemainingTokens("connect", "user-1", "ws-1");
      expect(remaining).toBe(15);
    });

    it("should only reset target user/workspace", async () => {
      // User 1 consumes tokens
      await limiter.checkLimit("connect", "user-1", "ws-1");

      // User 2 consumes tokens
      await limiter.checkLimit("connect", "user-2", "ws-1");

      // Reset user 1
      limiter.resetUserLimits("user-1", "ws-1");

      // User 1 should be reset
      const user1Remaining = limiter.getRemainingTokens(
        "connect",
        "user-1",
        "ws-1"
      );
      expect(user1Remaining).toBe(15);

      // User 2 should NOT be reset
      const user2Remaining = limiter.getRemainingTokens(
        "connect",
        "user-2",
        "ws-1"
      );
      expect(user2Remaining).toBeLessThan(15);
    });
  });

  describe("getStatistics", () => {
    it("should return active bucket count", async () => {
      await limiter.checkLimit("connect", "user-1", "ws-1");
      await limiter.checkLimit("connect", "user-2", "ws-1");

      const stats = limiter.getStatistics();
      expect(stats.activeBuckets).toBeGreaterThanOrEqual(2);
    });

    it("should report global tokens remaining", async () => {
      const stats = limiter.getStatistics();
      expect(stats.globalTokensRemaining).toBeGreaterThan(0);
    });

    it("should include all limit configs", async () => {
      const stats = limiter.getStatistics();
      expect(stats.limitConfigs.connect).toBeDefined();
      expect(stats.limitConfigs.validate).toBeDefined();
      expect(stats.limitConfigs.resolve).toBeDefined();
    });
  });

  describe("setLimit", () => {
    it("should allow custom limit configuration", async () => {
      limiter.setLimit("connect", 5); // Reduce to 5/min

      // Consume 5 tokens
      for (let i = 0; i < 5; i++) {
        const result = await limiter.checkLimit("connect", "user-1", "ws-1");
        expect(result.allowed).toBe(true);
      }

      // 6th should fail
      const result = await limiter.checkLimit("connect", "user-1", "ws-1");
      expect(result.allowed).toBe(false);
    });
  });

  describe("burst handling", () => {
    it("should allow burst above sustained rate", async () => {
      // Connect has 10/min sustained, 15 burst
      // Should allow 15 consecutive ops
      for (let i = 0; i < 15; i++) {
        const result = await limiter.checkLimit("connect", "user-1", "ws-1");
        expect(result.allowed).toBe(true);
      }

      // 16th should fail
      const result = await limiter.checkLimit("connect", "user-1", "ws-1");
      expect(result.allowed).toBe(false);
    });
  });

  describe("global rate limiting", () => {
    it("should enforce global limit across all operations", async () => {
      // Consume 2000 global tokens (2000/min global)
      // Mix of operations
      let consumed = 0;

      for (let i = 0; i < 300 && consumed < 2000; i++) {
        const result = await limiter.checkLimit("resolve", "user-1", "ws-1");
        if (result.allowed) consumed++;
      }

      // Should hit global limit
      const result = await limiter.checkLimit("resolve", "user-1", "ws-1");
      expect(result.allowed).toBe(false);
    });
  });
});
