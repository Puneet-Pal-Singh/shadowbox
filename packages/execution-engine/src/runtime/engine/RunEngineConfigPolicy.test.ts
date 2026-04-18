import { describe, expect, it } from "vitest";
import {
  resolveBudgetConfig,
  resolveUnknownPricingMode,
} from "./RunEngineConfigPolicy.js";

describe("RunEngineConfigPolicy", () => {
  it("uses the injected NODE_ENV when resolving unknown pricing mode", () => {
    expect(
      resolveUnknownPricingMode({
        NODE_ENV: "production",
      }),
    ).toBe("block");
  });

  it("throws when budget config is invalid instead of silently disabling caps", () => {
    expect(() =>
      resolveBudgetConfig({
        MAX_RUN_BUDGET: "abc",
      }),
    ).toThrow("Invalid MAX_RUN_BUDGET=abc");

    expect(() =>
      resolveBudgetConfig({
        MAX_SESSION_BUDGET: "-1",
      }),
    ).toThrow("Invalid MAX_SESSION_BUDGET=-1");
  });
});
