import { z } from "zod";

export const ScalePhaseSchema = z.enum(["5_to_100"]);
export type ScalePhase = z.infer<typeof ScalePhaseSchema>;

export const FailureDomainSchema = z.enum([
  "runtime",
  "chat",
  "provider",
  "streaming",
]);
export type FailureDomain = z.infer<typeof FailureDomainSchema>;

export const ScaleLoadProfileSchema = z
  .object({
    phase: ScalePhaseSchema,
    concurrentUsers: z.number().int().positive(),
    targetRequestsPerSecond: z.number().positive(),
    testDurationMinutes: z.number().int().positive(),
  })
  .strict();
export type ScaleLoadProfile = z.infer<typeof ScaleLoadProfileSchema>;

export const ScaleSloTargetsSchema = z
  .object({
    p95LatencyMs: z.number().int().positive(),
    maxErrorRatePercent: z.number().min(0).max(100),
    minThroughputRps: z.number().positive(),
  })
  .strict();
export type ScaleSloTargets = z.infer<typeof ScaleSloTargetsSchema>;

export const ScaleRunbookScenarioSchema = z
  .object({
    id: z.string().min(1),
    domain: FailureDomainSchema,
    severity: z.enum(["critical", "high"]),
    responseSlaMinutes: z.number().int().positive(),
    ownerRole: z.string().min(1),
  })
  .strict();
export type ScaleRunbookScenario = z.infer<typeof ScaleRunbookScenarioSchema>;

export const ContractRegressionGateSchema = z
  .object({
    requiredSuites: z.array(z.string().min(1)).min(1),
    maxCriticalFailures: z.number().int().nonnegative(),
  })
  .strict();
export type ContractRegressionGate = z.infer<typeof ContractRegressionGateSchema>;

export const ScaleReliabilityBaselineSchema = z
  .object({
    phase: ScalePhaseSchema,
    loadProfile: ScaleLoadProfileSchema,
    sloTargets: ScaleSloTargetsSchema,
    contractRegressionGate: ContractRegressionGateSchema,
    runbookScenarios: z.array(ScaleRunbookScenarioSchema).min(1),
  })
  .strict();
export type ScaleReliabilityBaseline = z.infer<
  typeof ScaleReliabilityBaselineSchema
>;

export const ScaleObservationSchema = z
  .object({
    p95LatencyMs: z.number().int().nonnegative(),
    errorRatePercent: z.number().min(0).max(100),
    throughputRps: z.number().nonnegative(),
    criticalContractFailures: z.number().int().nonnegative(),
  })
  .strict();
export type ScaleObservation = z.infer<typeof ScaleObservationSchema>;

export interface ScaleAssessmentResult {
  status: "pass" | "fail";
  failures: string[];
}

export const SCALE_RELIABILITY_BASELINE_5_TO_100: ScaleReliabilityBaseline = {
  phase: "5_to_100",
  loadProfile: {
    phase: "5_to_100",
    concurrentUsers: 100,
    targetRequestsPerSecond: 20,
    testDurationMinutes: 30,
  },
  sloTargets: {
    p95LatencyMs: 2000,
    maxErrorRatePercent: 1,
    minThroughputRps: 15,
  },
  contractRegressionGate: {
    requiredSuites: [
      "chat-response-contract.test.ts",
      "external-contracts.test.ts",
      "LLMGateway.provider-matrix.test.ts",
    ],
    maxCriticalFailures: 0,
  },
  runbookScenarios: [
    {
      id: "runtime-degraded-loop",
      domain: "runtime",
      severity: "critical",
      responseSlaMinutes: 15,
      ownerRole: "runtime-oncall",
    },
    {
      id: "chat-stream-drop",
      domain: "chat",
      severity: "high",
      responseSlaMinutes: 20,
      ownerRole: "chat-oncall",
    },
    {
      id: "provider-resolution-failure",
      domain: "provider",
      severity: "critical",
      responseSlaMinutes: 15,
      ownerRole: "provider-oncall",
    },
    {
      id: "streaming-contract-regression",
      domain: "streaming",
      severity: "critical",
      responseSlaMinutes: 10,
      ownerRole: "platform-oncall",
    },
  ],
};

export function getScaleReliabilityBaseline(): ScaleReliabilityBaseline {
  return ScaleReliabilityBaselineSchema.parse(SCALE_RELIABILITY_BASELINE_5_TO_100);
}

export function assessScaleReliability(
  observation: ScaleObservation,
  baseline: ScaleReliabilityBaseline = SCALE_RELIABILITY_BASELINE_5_TO_100,
): ScaleAssessmentResult {
  const validatedObservation = ScaleObservationSchema.parse(observation);
  const validatedBaseline = ScaleReliabilityBaselineSchema.parse(baseline);
  const failures = collectScaleFailures(validatedObservation, validatedBaseline);
  return { status: failures.length === 0 ? "pass" : "fail", failures };
}

export function listRunbookDomains(
  baseline: ScaleReliabilityBaseline = SCALE_RELIABILITY_BASELINE_5_TO_100,
): FailureDomain[] {
  const validatedBaseline = ScaleReliabilityBaselineSchema.parse(baseline);
  const domains = new Set<FailureDomain>();
  for (const scenario of validatedBaseline.runbookScenarios) {
    domains.add(scenario.domain);
  }
  return Array.from(domains.values());
}

function collectScaleFailures(
  observation: ScaleObservation,
  baseline: ScaleReliabilityBaseline,
): string[] {
  const failures: string[] = [];
  if (observation.p95LatencyMs > baseline.sloTargets.p95LatencyMs) {
    failures.push("p95 latency exceeded SLO target");
  }
  if (observation.errorRatePercent > baseline.sloTargets.maxErrorRatePercent) {
    failures.push("error rate exceeded SLO budget");
  }
  if (observation.throughputRps < baseline.sloTargets.minThroughputRps) {
    failures.push("throughput below baseline target");
  }
  if (
    observation.criticalContractFailures >
    baseline.contractRegressionGate.maxCriticalFailures
  ) {
    failures.push("critical contract regressions detected");
  }
  return failures;
}
