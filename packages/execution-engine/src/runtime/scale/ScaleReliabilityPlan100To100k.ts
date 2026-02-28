import { z } from "zod";

export const ScaleTrack100To100kSchema = z.literal("100_to_100k");
export type ScaleTrack100To100k = z.infer<typeof ScaleTrack100To100kSchema>;

export const ContainmentServiceSchema = z.enum([
  "orchestration",
  "provider_runtime",
  "streaming_pipeline",
  "event_storage",
]);
export type ContainmentService = z.infer<typeof ContainmentServiceSchema>;

export const CapacityProfile100To100kSchema = z
  .object({
    track: ScaleTrack100To100kSchema,
    targetConcurrentUsers: z.number().int().positive(),
    targetRequestsPerSecond: z.number().positive(),
    soakDurationMinutes: z.number().int().positive(),
    spikeMultiplier: z.number().min(1),
  })
  .strict();
export type CapacityProfile100To100k = z.infer<
  typeof CapacityProfile100To100kSchema
>;

export const ReliabilityTargets100To100kSchema = z
  .object({
    p95LatencyMs: z.number().int().positive(),
    maxErrorRatePercent: z.number().min(0).max(100),
    minAvailabilityPercent: z.number().min(0).max(100),
  })
  .strict();
export type ReliabilityTargets100To100k = z.infer<
  typeof ReliabilityTargets100To100kSchema
>;

export const CostThresholds100To100kSchema = z
  .object({
    maxCostPer1kRequestsUsd: z.number().positive(),
    monthlyBudgetUsd: z.number().positive(),
    budgetAlertAtPercent: z.number().min(0).max(100),
  })
  .strict();
export type CostThresholds100To100k = z.infer<
  typeof CostThresholds100To100kSchema
>;

export const SaturationThresholds100To100kSchema = z
  .object({
    maxQueueDepth: z.number().int().nonnegative(),
    maxProviderP95LatencyMs: z.number().int().positive(),
    maxCircuitBreakerOpenPercent: z.number().min(0).max(100),
  })
  .strict();
export type SaturationThresholds100To100k = z.infer<
  typeof SaturationThresholds100To100kSchema
>;

export const ContainmentStrategySchema = z
  .object({
    service: ContainmentServiceSchema,
    strategy: z.string().min(1),
    maxBlastRadius: z.string().min(1),
    ownerRole: z.string().min(1),
  })
  .strict();
export type ContainmentStrategy = z.infer<typeof ContainmentStrategySchema>;

export const RegressionGate100To100kSchema = z
  .object({
    requiredSuites: z.array(z.string().min(1)).min(1),
    maxCriticalFailures: z.number().int().nonnegative(),
  })
  .strict();
export type RegressionGate100To100k = z.infer<
  typeof RegressionGate100To100kSchema
>;

export const ScaleReliabilityPlan100To100kSchema = z
  .object({
    track: ScaleTrack100To100kSchema,
    capacityProfile: CapacityProfile100To100kSchema,
    reliabilityTargets: ReliabilityTargets100To100kSchema,
    costThresholds: CostThresholds100To100kSchema,
    saturationThresholds: SaturationThresholds100To100kSchema,
    containmentStrategies: z.array(ContainmentStrategySchema).min(1),
    regressionGate: RegressionGate100To100kSchema,
  })
  .strict();
export type ScaleReliabilityPlan100To100k = z.infer<
  typeof ScaleReliabilityPlan100To100kSchema
>;

export const ScaleObservation100To100kSchema = z
  .object({
    p95LatencyMs: z.number().int().nonnegative(),
    errorRatePercent: z.number().min(0).max(100),
    availabilityPercent: z.number().min(0).max(100),
    costPer1kRequestsUsd: z.number().nonnegative(),
    queueDepth: z.number().int().nonnegative(),
    providerP95LatencyMs: z.number().int().nonnegative(),
    circuitBreakerOpenPercent: z.number().min(0).max(100),
    criticalContractFailures: z.number().int().nonnegative(),
  })
  .strict();
export type ScaleObservation100To100k = z.infer<
  typeof ScaleObservation100To100kSchema
>;

export interface ScaleAssessment100To100k {
  status: "pass" | "fail";
  failures: string[];
  mitigationActions: string[];
}

export const SCALE_RELIABILITY_PLAN_100_TO_100K: ScaleReliabilityPlan100To100k =
  {
    track: "100_to_100k",
    capacityProfile: {
      track: "100_to_100k",
      targetConcurrentUsers: 100000,
      targetRequestsPerSecond: 2500,
      soakDurationMinutes: 180,
      spikeMultiplier: 1.8,
    },
    reliabilityTargets: {
      p95LatencyMs: 1500,
      maxErrorRatePercent: 0.75,
      minAvailabilityPercent: 99.9,
    },
    costThresholds: {
      maxCostPer1kRequestsUsd: 0.45,
      monthlyBudgetUsd: 45000,
      budgetAlertAtPercent: 80,
    },
    saturationThresholds: {
      maxQueueDepth: 300,
      maxProviderP95LatencyMs: 2400,
      maxCircuitBreakerOpenPercent: 5,
    },
    containmentStrategies: [
      {
        service: "orchestration",
        strategy: "Apply queue backpressure and bounded retry windows",
        maxBlastRadius: "single workspace",
        ownerRole: "orchestration-oncall",
      },
      {
        service: "provider_runtime",
        strategy: "Trip provider-scoped circuit breakers with fallback denial",
        maxBlastRadius: "single provider",
        ownerRole: "provider-oncall",
      },
      {
        service: "streaming_pipeline",
        strategy: "Degrade to chunked responses while preserving contracts",
        maxBlastRadius: "single run channel",
        ownerRole: "runtime-oncall",
      },
      {
        service: "event_storage",
        strategy: "Throttle writes and prioritize final event persistence",
        maxBlastRadius: "single partition",
        ownerRole: "platform-oncall",
      },
    ],
    regressionGate: {
      requiredSuites: [
        "chat-response-contract.test.ts",
        "external-contracts.test.ts",
        "LLMGateway.provider-matrix.test.ts",
      ],
      maxCriticalFailures: 0,
    },
  };

export function getScaleReliabilityPlan100To100k(): ScaleReliabilityPlan100To100k {
  return ScaleReliabilityPlan100To100kSchema.parse(
    SCALE_RELIABILITY_PLAN_100_TO_100K,
  );
}

export function assessScaleReliability100To100k(
  observation: ScaleObservation100To100k,
  plan: ScaleReliabilityPlan100To100k = SCALE_RELIABILITY_PLAN_100_TO_100K,
): ScaleAssessment100To100k {
  const validatedObservation = ScaleObservation100To100kSchema.parse(observation);
  const validatedPlan = ScaleReliabilityPlan100To100kSchema.parse(plan);
  const failures = collectReliabilityFailures(validatedObservation, validatedPlan);
  const mitigationActions = collectMitigationActions(failures);
  return {
    status: failures.length === 0 ? "pass" : "fail",
    failures,
    mitigationActions,
  };
}

export function listContainmentServices(
  plan: ScaleReliabilityPlan100To100k = SCALE_RELIABILITY_PLAN_100_TO_100K,
): ContainmentService[] {
  const validatedPlan = ScaleReliabilityPlan100To100kSchema.parse(plan);
  const services = new Set<ContainmentService>();
  for (const strategy of validatedPlan.containmentStrategies) {
    services.add(strategy.service);
  }
  return Array.from(services.values());
}

function collectReliabilityFailures(
  observation: ScaleObservation100To100k,
  plan: ScaleReliabilityPlan100To100k,
): string[] {
  const failures: string[] = [];
  if (observation.p95LatencyMs > plan.reliabilityTargets.p95LatencyMs) {
    failures.push("p95 latency exceeded 100_to_100k target");
  }
  if (observation.errorRatePercent > plan.reliabilityTargets.maxErrorRatePercent) {
    failures.push("error rate exceeded 100_to_100k budget");
  }
  if (observation.availabilityPercent < plan.reliabilityTargets.minAvailabilityPercent) {
    failures.push("availability fell below 100_to_100k target");
  }
  if (observation.costPer1kRequestsUsd > plan.costThresholds.maxCostPer1kRequestsUsd) {
    failures.push("cost per 1k requests exceeded threshold");
  }
  if (observation.queueDepth > plan.saturationThresholds.maxQueueDepth) {
    failures.push("queue depth exceeded saturation threshold");
  }
  if (
    observation.providerP95LatencyMs >
    plan.saturationThresholds.maxProviderP95LatencyMs
  ) {
    failures.push("provider latency exceeded saturation threshold");
  }
  if (
    observation.circuitBreakerOpenPercent >
    plan.saturationThresholds.maxCircuitBreakerOpenPercent
  ) {
    failures.push("circuit breaker open percentage exceeded threshold");
  }
  if (observation.criticalContractFailures > plan.regressionGate.maxCriticalFailures) {
    failures.push("critical contract regressions detected in scale profile");
  }
  return failures;
}

function collectMitigationActions(failures: string[]): string[] {
  if (failures.length === 0) {
    return [];
  }

  const actions = new Set<string>();
  for (const failure of failures) {
    if (failure.includes("latency")) {
      actions.add("Increase provider and orchestration concurrency headroom");
    }
    if (failure.includes("error rate") || failure.includes("contract")) {
      actions.add("Run contract regression suites and halt rollout on failures");
    }
    if (failure.includes("availability")) {
      actions.add("Activate containment strategy and isolate degraded services");
    }
    if (failure.includes("cost")) {
      actions.add("Apply model-routing cost caps and tighten budget guardrails");
    }
    if (failure.includes("queue depth")) {
      actions.add("Enable backpressure and reduce queue admission rate");
    }
    if (failure.includes("circuit breaker")) {
      actions.add("Investigate provider instability and tune breaker thresholds");
    }
  }

  return Array.from(actions.values());
}
