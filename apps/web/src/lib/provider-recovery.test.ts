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

  it("returns default advice for unknown errors", () => {
    const advice = getProviderRecoveryAdvice("Unexpected backend error");
    expect(advice.actionLabel).toBe("Open Provider Settings");
    expect(advice.message).toContain("Unexpected backend error");
  });
});
