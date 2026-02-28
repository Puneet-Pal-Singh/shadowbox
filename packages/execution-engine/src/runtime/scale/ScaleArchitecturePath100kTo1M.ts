import { z } from "zod";

export const ScaleTrack100kTo1MSchema = z.literal("100k_to_1m");
export type ScaleTrack100kTo1M = z.infer<typeof ScaleTrack100kTo1MSchema>;

export const ScaleStageSchema = z.enum(["100k", "250k", "500k", "1m"]);
export type ScaleStage = z.infer<typeof ScaleStageSchema>;

export const StageValidationMethodSchema = z.enum([
  "capacity_model",
  "traffic_replay",
  "load_test",
]);
export type StageValidationMethod = z.infer<typeof StageValidationMethodSchema>;

export const StageAssumptionSchema = z
  .object({
    stage: ScaleStageSchema,
    targetConcurrentUsers: z.number().int().positive(),
    targetRequestsPerSecond: z.number().positive(),
    validationMethod: StageValidationMethodSchema,
  })
  .strict();
export type StageAssumption = z.infer<typeof StageAssumptionSchema>;

export const FailureClassSchema = z.enum([
  "provider_outage",
  "queue_overload",
  "event_storage_hotspot",
  "control_plane_failure",
]);
export type FailureClass = z.infer<typeof FailureClassSchema>;

export const ResilienceMechanismSchema = z
  .object({
    id: z.string().min(1),
    failureClass: FailureClassSchema,
    strategy: z.string().min(1),
    degradationMode: z.string().min(1),
    ownerRole: z.string().min(1),
  })
  .strict();
export type ResilienceMechanism = z.infer<typeof ResilienceMechanismSchema>;

export const ReleaseControlSchema = z
  .object({
    id: z.string().min(1),
    controlType: z.enum(["canary", "progressive", "kill_switch", "contract_guard"]),
    rollbackSlaMinutes: z.number().int().positive(),
  })
  .strict();
export type ReleaseControl = z.infer<typeof ReleaseControlSchema>;

export const OperationalPlaybookSchema = z
  .object({
    incidentType: FailureClassSchema,
    runbookId: z.string().min(1),
    rtoMinutes: z.number().int().positive(),
    ownerRole: z.string().min(1),
  })
  .strict();
export type OperationalPlaybook = z.infer<typeof OperationalPlaybookSchema>;

export const ScaleRegressionGateSchema = z
  .object({
    requiredSuites: z.array(z.string().min(1)).min(1),
    maxCriticalFailures: z.number().int().nonnegative(),
  })
  .strict();
export type ScaleRegressionGate = z.infer<typeof ScaleRegressionGateSchema>;

export const ScaleArchitecturePath100kTo1MSchema = z
  .object({
    track: ScaleTrack100kTo1MSchema,
    stageAssumptions: z.array(StageAssumptionSchema).min(1),
    resilienceMechanisms: z.array(ResilienceMechanismSchema).min(1),
    operationalPlaybooks: z.array(OperationalPlaybookSchema).min(1),
    releaseControls: z.array(ReleaseControlSchema).min(1),
    minResiliencePassRatePercent: z.number().min(0).max(100),
    maxReleaseControlFailures: z.number().int().nonnegative(),
    maxUnresolvedCriticalIncidents: z.number().int().nonnegative(),
    regressionGate: ScaleRegressionGateSchema,
  })
  .strict();
export type ScaleArchitecturePath100kTo1M = z.infer<
  typeof ScaleArchitecturePath100kTo1MSchema
>;

export const ScaleArchitectureObservation100kTo1MSchema = z
  .object({
    validatedStages: z.array(ScaleStageSchema),
    resiliencePassRatePercent: z.number().min(0).max(100),
    releaseControlFailures: z.number().int().nonnegative(),
    unresolvedCriticalIncidents: z.number().int().nonnegative(),
    criticalContractFailures: z.number().int().nonnegative(),
  })
  .strict();
export type ScaleArchitectureObservation100kTo1M = z.infer<
  typeof ScaleArchitectureObservation100kTo1MSchema
>;

export interface ScaleArchitectureAssessment100kTo1M {
  status: "pass" | "fail";
  failures: string[];
  remediation: string[];
}

export const SCALE_ARCHITECTURE_PATH_100K_TO_1M: ScaleArchitecturePath100kTo1M =
  {
    track: "100k_to_1m",
    stageAssumptions: [
      {
        stage: "100k",
        targetConcurrentUsers: 100000,
        targetRequestsPerSecond: 3000,
        validationMethod: "capacity_model",
      },
      {
        stage: "250k",
        targetConcurrentUsers: 250000,
        targetRequestsPerSecond: 7000,
        validationMethod: "traffic_replay",
      },
      {
        stage: "500k",
        targetConcurrentUsers: 500000,
        targetRequestsPerSecond: 13000,
        validationMethod: "load_test",
      },
      {
        stage: "1m",
        targetConcurrentUsers: 1000000,
        targetRequestsPerSecond: 25000,
        validationMethod: "load_test",
      },
    ],
    resilienceMechanisms: [
      {
        id: "provider-failover",
        failureClass: "provider_outage",
        strategy: "Provider-scoped failover with hard isolation boundaries",
        degradationMode: "reject new traffic for impacted provider",
        ownerRole: "provider-oncall",
      },
      {
        id: "queue-backpressure",
        failureClass: "queue_overload",
        strategy: "Token-bucket admission with bounded queue depth",
        degradationMode: "defer non-critical workloads",
        ownerRole: "orchestration-oncall",
      },
      {
        id: "event-partition-throttle",
        failureClass: "event_storage_hotspot",
        strategy: "Partition-aware throttling and prioritized flush",
        degradationMode: "persist final events first",
        ownerRole: "platform-oncall",
      },
      {
        id: "control-plane-safe-mode",
        failureClass: "control_plane_failure",
        strategy: "Run-level safe mode with command gating",
        degradationMode: "disable non-essential write paths",
        ownerRole: "runtime-oncall",
      },
    ],
    operationalPlaybooks: [
      {
        incidentType: "provider_outage",
        runbookId: "RB-PROVIDER-FAILOVER-001",
        rtoMinutes: 20,
        ownerRole: "provider-oncall",
      },
      {
        incidentType: "queue_overload",
        runbookId: "RB-QUEUE-BACKPRESSURE-002",
        rtoMinutes: 15,
        ownerRole: "orchestration-oncall",
      },
      {
        incidentType: "event_storage_hotspot",
        runbookId: "RB-EVENT-PARTITION-003",
        rtoMinutes: 25,
        ownerRole: "platform-oncall",
      },
      {
        incidentType: "control_plane_failure",
        runbookId: "RB-CONTROL-SAFE-MODE-004",
        rtoMinutes: 10,
        ownerRole: "runtime-oncall",
      },
    ],
    releaseControls: [
      {
        id: "global-canary",
        controlType: "canary",
        rollbackSlaMinutes: 10,
      },
      {
        id: "progressive-ramp",
        controlType: "progressive",
        rollbackSlaMinutes: 15,
      },
      {
        id: "runtime-kill-switch",
        controlType: "kill_switch",
        rollbackSlaMinutes: 5,
      },
      {
        id: "contract-guard",
        controlType: "contract_guard",
        rollbackSlaMinutes: 5,
      },
    ],
    minResiliencePassRatePercent: 95,
    maxReleaseControlFailures: 0,
    maxUnresolvedCriticalIncidents: 0,
    regressionGate: {
      requiredSuites: [
        "chat-response-contract.test.ts",
        "external-contracts.test.ts",
        "LLMGateway.provider-matrix.test.ts",
      ],
      maxCriticalFailures: 0,
    },
  };

export function getScaleArchitecturePath100kTo1M(): ScaleArchitecturePath100kTo1M {
  return ScaleArchitecturePath100kTo1MSchema.parse(
    SCALE_ARCHITECTURE_PATH_100K_TO_1M,
  );
}

export function assessScaleArchitecturePath100kTo1M(
  observation: ScaleArchitectureObservation100kTo1M,
  path: ScaleArchitecturePath100kTo1M = SCALE_ARCHITECTURE_PATH_100K_TO_1M,
): ScaleArchitectureAssessment100kTo1M {
  const validatedObservation = ScaleArchitectureObservation100kTo1MSchema.parse(
    observation,
  );
  const validatedPath = ScaleArchitecturePath100kTo1MSchema.parse(path);
  const failures = collectArchitectureFailures(validatedObservation, validatedPath);
  return {
    status: failures.length === 0 ? "pass" : "fail",
    failures,
    remediation: mapArchitectureRemediation(failures),
  };
}

export function listMajorFailureClasses(
  path: ScaleArchitecturePath100kTo1M = SCALE_ARCHITECTURE_PATH_100K_TO_1M,
): FailureClass[] {
  const validatedPath = ScaleArchitecturePath100kTo1MSchema.parse(path);
  const failureClasses = new Set<FailureClass>();
  for (const mechanism of validatedPath.resilienceMechanisms) {
    failureClasses.add(mechanism.failureClass);
  }
  return Array.from(failureClasses.values());
}

function collectArchitectureFailures(
  observation: ScaleArchitectureObservation100kTo1M,
  path: ScaleArchitecturePath100kTo1M,
): string[] {
  const failures: string[] = [];

  const requiredStages = path.stageAssumptions.map((stage) => stage.stage);
  for (const stage of requiredStages) {
    if (!observation.validatedStages.includes(stage)) {
      failures.push(`missing validated stage: ${stage}`);
    }
  }

  if (observation.resiliencePassRatePercent < path.minResiliencePassRatePercent) {
    failures.push("resilience pass rate below required threshold");
  }
  if (observation.releaseControlFailures > path.maxReleaseControlFailures) {
    failures.push("release control failures detected");
  }
  if (
    observation.unresolvedCriticalIncidents >
    path.maxUnresolvedCriticalIncidents
  ) {
    failures.push("unresolved critical incidents exceed threshold");
  }
  if (
    observation.criticalContractFailures >
    path.regressionGate.maxCriticalFailures
  ) {
    failures.push("contract compliance failed under high-scale stress");
  }

  return failures;
}

function mapArchitectureRemediation(failures: string[]): string[] {
  if (failures.length === 0) {
    return [];
  }

  const remediation = new Set<string>();
  for (const failure of failures) {
    if (failure.startsWith("missing validated stage")) {
      remediation.add("Execute staged validation run before scale promotion");
    }
    if (failure.includes("resilience pass rate")) {
      remediation.add("Re-test major failure classes and harden degradation paths");
    }
    if (failure.includes("release control")) {
      remediation.add("Block rollout and repair release-control automation");
    }
    if (failure.includes("critical incidents")) {
      remediation.add("Resolve P0/P1 incidents before next scale checkpoint");
    }
    if (failure.includes("contract compliance")) {
      remediation.add("Run contract regression gate and halt rollout on breaks");
    }
  }

  return Array.from(remediation.values());
}
