import { describe, expect, it } from "vitest";
import {
  PROVIDER_LIFECYCLE_STEPS,
  createInitialProviderLifecycleState,
  isProviderLifecycleStep,
} from "./state-machine.js";

describe("provider lifecycle state machine baseline", () => {
  it("exposes canonical lifecycle order", () => {
    expect(PROVIDER_LIFECYCLE_STEPS).toEqual([
      "discover_providers",
      "connect_credential",
      "validate_credential",
      "select_default",
      "resolve_for_run",
      "disconnect",
    ]);
  });

  it("builds deterministic initial state", () => {
    expect(createInitialProviderLifecycleState()).toEqual({
      step: "discover_providers",
      connectedCredentialIds: [],
    });
  });

  it("guards lifecycle step checks", () => {
    expect(isProviderLifecycleStep("connect_credential")).toBe(true);
    expect(isProviderLifecycleStep("unknown_step")).toBe(false);
  });
});
