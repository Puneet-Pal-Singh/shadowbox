import { describe, expect, it } from "vitest";
import {
  SCALE_RELIABILITY_BASELINE_5_TO_100,
  assessScaleReliability,
  getScaleReliabilityBaseline,
  listRunbookDomains,
} from "./index.js";

describe("ScaleReliabilityBaseline", () => {
  it("returns the parsed baseline for 5 to 100 scale", () => {
    const baseline = getScaleReliabilityBaseline();

    expect(baseline.phase).toBe("5_to_100");
    expect(baseline.loadProfile.concurrentUsers).toBe(100);
    expect(baseline.contractRegressionGate.requiredSuites).toContain(
      "external-contracts.test.ts",
    );
  });

  it("passes assessment when observation meets SLO and regression gates", () => {
    const result = assessScaleReliability({
      p95LatencyMs: 1400,
      errorRatePercent: 0.5,
      throughputRps: 18,
      criticalContractFailures: 0,
    });

    expect(result.status).toBe("pass");
    expect(result.failures).toEqual([]);
  });

  it("fails assessment with explicit failure reasons when thresholds are violated", () => {
    const result = assessScaleReliability({
      p95LatencyMs: 2500,
      errorRatePercent: 2,
      throughputRps: 10,
      criticalContractFailures: 1,
    });

    expect(result.status).toBe("fail");
    expect(result.failures).toEqual([
      "p95 latency exceeded SLO target",
      "error rate exceeded SLO budget",
      "throughput below baseline target",
      "critical contract regressions detected",
    ]);
  });

  it("lists unique runbook failure domains", () => {
    const domains = listRunbookDomains(SCALE_RELIABILITY_BASELINE_5_TO_100);
    expect(domains).toEqual(["runtime", "chat", "provider", "streaming"]);
  });

  it("throws when observation has invalid values", () => {
    expect(() =>
      assessScaleReliability({
        p95LatencyMs: -1,
        errorRatePercent: 0,
        throughputRps: 1,
        criticalContractFailures: 0,
      }),
    ).toThrow();
  });
});
