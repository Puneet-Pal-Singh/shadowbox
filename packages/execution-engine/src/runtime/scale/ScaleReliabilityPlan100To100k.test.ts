import { describe, expect, it } from "vitest";
import {
  SCALE_RELIABILITY_PLAN_100_TO_100K,
  assessScaleReliability100To100k,
  getScaleReliabilityPlan100To100k,
  listContainmentServices,
} from "./index.js";

describe("ScaleReliabilityPlan100To100k", () => {
  it("returns parsed 100_to_100k plan", () => {
    const plan = getScaleReliabilityPlan100To100k();

    expect(plan.track).toBe("100_to_100k");
    expect(plan.capacityProfile.targetConcurrentUsers).toBe(100000);
    expect(plan.regressionGate.requiredSuites).toContain(
      "external-contracts.test.ts",
    );
  });

  it("passes when observation meets reliability, cost, and saturation targets", () => {
    const result = assessScaleReliability100To100k({
      p95LatencyMs: 1200,
      errorRatePercent: 0.4,
      availabilityPercent: 99.95,
      costPer1kRequestsUsd: 0.4,
      queueDepth: 180,
      providerP95LatencyMs: 1800,
      circuitBreakerOpenPercent: 2,
      criticalContractFailures: 0,
    });

    expect(result.status).toBe("pass");
    expect(result.failures).toEqual([]);
    expect(result.mitigationActions).toEqual([]);
  });

  it("fails with explicit reasons and mitigation actions when thresholds are breached", () => {
    const result = assessScaleReliability100To100k({
      p95LatencyMs: 2100,
      errorRatePercent: 1.2,
      availabilityPercent: 99.2,
      costPer1kRequestsUsd: 0.7,
      queueDepth: 420,
      providerP95LatencyMs: 3000,
      circuitBreakerOpenPercent: 9,
      criticalContractFailures: 1,
    });

    expect(result.status).toBe("fail");
    expect(result.failures).toEqual([
      "p95 latency exceeded 100_to_100k target",
      "error rate exceeded 100_to_100k budget",
      "availability fell below 100_to_100k target",
      "cost per 1k requests exceeded threshold",
      "queue depth exceeded saturation threshold",
      "provider latency exceeded saturation threshold",
      "circuit breaker open percentage exceeded threshold",
      "critical contract regressions detected in scale profile",
    ]);
    expect(result.mitigationActions).toContain(
      "Enable backpressure and reduce queue admission rate",
    );
    expect(result.mitigationActions).toContain(
      "Run contract regression suites and halt rollout on failures",
    );
  });

  it("lists containment services for critical path isolation", () => {
    const services = listContainmentServices(SCALE_RELIABILITY_PLAN_100_TO_100K);
    expect(services).toEqual([
      "orchestration",
      "provider_runtime",
      "streaming_pipeline",
      "event_storage",
    ]);
  });

  it("throws for invalid observation payloads", () => {
    expect(() =>
      assessScaleReliability100To100k({
        p95LatencyMs: -1,
        errorRatePercent: 0,
        availabilityPercent: 100,
        costPer1kRequestsUsd: 0,
        queueDepth: 1,
        providerP95LatencyMs: 1,
        circuitBreakerOpenPercent: 0,
        criticalContractFailures: 0,
      }),
    ).toThrow();
  });
});
