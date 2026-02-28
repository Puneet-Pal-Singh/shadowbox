import { describe, expect, it } from "vitest";
import {
  SCALE_ARCHITECTURE_PATH_100K_TO_1M,
  assessScaleArchitecturePath100kTo1M,
  getScaleArchitecturePath100kTo1M,
  listMajorFailureClasses,
} from "./index.js";

describe("ScaleArchitecturePath100kTo1M", () => {
  it("returns parsed architecture path for 100k->1m track", () => {
    const path = getScaleArchitecturePath100kTo1M();

    expect(path.track).toBe("100k_to_1m");
    expect(path.stageAssumptions).toHaveLength(4);
    expect(path.releaseControls).toHaveLength(4);
  });

  it("passes when staged validation, resilience, controls, and contracts are healthy", () => {
    const result = assessScaleArchitecturePath100kTo1M({
      validatedStages: ["100k", "250k", "500k", "1m"],
      resiliencePassRatePercent: 97,
      releaseControlFailures: 0,
      unresolvedCriticalIncidents: 0,
      criticalContractFailures: 0,
    });

    expect(result.status).toBe("pass");
    expect(result.failures).toEqual([]);
    expect(result.remediation).toEqual([]);
  });

  it("fails with explicit remediation when scale gates are not met", () => {
    const result = assessScaleArchitecturePath100kTo1M({
      validatedStages: ["100k", "250k"],
      resiliencePassRatePercent: 82,
      releaseControlFailures: 2,
      unresolvedCriticalIncidents: 1,
      criticalContractFailures: 1,
    });

    expect(result.status).toBe("fail");
    expect(result.failures).toEqual([
      "missing validated stage: 500k",
      "missing validated stage: 1m",
      "resilience pass rate below required threshold",
      "release control failures detected",
      "unresolved critical incidents exceed threshold",
      "contract compliance failed under high-scale stress",
    ]);
    expect(result.remediation).toContain(
      "Execute staged validation run before scale promotion",
    );
    expect(result.remediation).toContain(
      "Run contract regression gate and halt rollout on breaks",
    );
  });

  it("lists major failure classes covered by resilience mechanisms", () => {
    const failureClasses = listMajorFailureClasses(
      SCALE_ARCHITECTURE_PATH_100K_TO_1M,
    );

    expect(failureClasses).toEqual([
      "provider_outage",
      "queue_overload",
      "event_storage_hotspot",
      "control_plane_failure",
    ]);
  });

  it("throws for invalid observations", () => {
    expect(() =>
      assessScaleArchitecturePath100kTo1M({
        validatedStages: ["100k"],
        resiliencePassRatePercent: -1,
        releaseControlFailures: 0,
        unresolvedCriticalIncidents: 0,
        criticalContractFailures: 0,
      }),
    ).toThrow();
  });
});
