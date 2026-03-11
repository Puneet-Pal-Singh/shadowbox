import { describe, expect, it } from "vitest";
import { getProviderRecoveryAdvice } from "./provider-recovery";

describe("provider recovery advice", () => {
  it("maps missing provider configuration to setup guidance", () => {
    const advice = getProviderRecoveryAdvice("No BYOK provider connected");
    expect(advice.actionLabel).toBe("Open Provider Settings");
    expect(advice.message).toContain("missing");
  });

  it("maps selection mismatch to session remediation", () => {
    const advice = getProviderRecoveryAdvice("INVALID_PROVIDER_SELECTION");
    expect(advice.actionLabel).toBe("Review Session Selection");
    expect(advice.remediation).toContain("Choose a connected provider");
  });

  it("maps active-run immutable selection conflicts to wait/stop guidance", () => {
    const advice = getProviderRecoveryAdvice("RUN_MANIFEST_IMMUTABLE");
    expect(advice.actionLabel).toBe("Wait or Stop Current Run");
    expect(advice.remediation).toContain("Wait for the current run to finish");
  });

  it("maps rate limit errors to provider switch guidance", () => {
    const advice = getProviderRecoveryAdvice("RATE_LIMIT exceeded for key");
    expect(advice.actionLabel).toBe("Switch Provider");
    expect(advice.remediation).toContain("Switch to another connected provider");
  });

  it("maps axis quota limit errors to provider switch guidance", () => {
    const advice = getProviderRecoveryAdvice("AXIS_DAILY_LIMIT_EXCEEDED");
    expect(advice.actionLabel).toBe("Switch Provider");
  });

  it("maps planning schema failures to prompt-specific remediation", () => {
    const advice = getProviderRecoveryAdvice("PLAN_SCHEMA_MISMATCH");
    expect(advice.actionLabel).toBe("Retry with Specific Task");
    expect(advice.remediation).toContain("concrete file path or command");
  });

  it("maps auth scope persistence issues to re-auth guidance", () => {
    const advice = getProviderRecoveryAdvice(
      "Unauthorized: missing or invalid authentication.",
    );
    expect(advice.actionLabel).toBe("Re-authenticate");
    expect(advice.message).toContain("authenticated");
  });

  it("returns default advice for unknown errors", () => {
    const advice = getProviderRecoveryAdvice("Unexpected backend error");
    expect(advice.actionLabel).toBe("Open Provider Settings");
    expect(advice.message).toContain("Unexpected backend error");
  });
});
