/**
 * ByokRateLimiter Scale Hardening Tests
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ByokRateLimiter } from "./ByokRateLimiter";

describe("ByokRateLimiter scale hardening", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("caps active buckets under high-cardinality traffic", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));

    const limiter = new ByokRateLimiter();
    const batches = 6;
    const requestsPerBatch = 2000;
    let allowed = 0;

    for (let batch = 0; batch < batches; batch++) {
      for (let i = 0; i < requestsPerBatch; i++) {
        const result = await limiter.checkLimit(
          "connect",
          `user-${batch}-${i}`,
          "workspace-scale",
        );
        if (result.allowed) {
          allowed++;
        }
      }

      vi.setSystemTime(Date.now() + 60_000);
    }

    const stats = limiter.getStatistics();
    expect(allowed).toBe(batches * requestsPerBatch);
    expect(stats.activeBuckets).toBeLessThanOrEqual(10_000);
  });

  it("keeps global token balance bounded after long idle periods", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));

    const limiter = new ByokRateLimiter();
    await limiter.checkLimit("resolve", "user-1", "workspace-1");

    vi.setSystemTime(Date.now() + 6 * 60 * 60 * 1000);

    const stats = limiter.getStatistics();
    expect(stats.globalTokensRemaining).toBeLessThanOrEqual(2000);
    expect(stats.globalTokensRemaining).toBeGreaterThan(0);
  });
});
