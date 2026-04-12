import { describe, expect, it } from "vitest";
import {
  resolveWebProviderProductEnvironment,
  resolveWebProviderProductPolicy,
} from "./provider-product-policy";

describe("resolveWebProviderProductEnvironment", () => {
  it("prefers explicit VITE_PRODUCT_ENV", () => {
    expect(
      resolveWebProviderProductEnvironment({
        mode: "production",
        productEnv: "staging",
      }),
    ).toBe("staging");
  });

  it("maps production mode to production environment", () => {
    expect(
      resolveWebProviderProductEnvironment({
        mode: "production",
      }),
    ).toBe("production");
  });

  it("throws on unrecognized environment values", () => {
    expect(() =>
      resolveWebProviderProductEnvironment({
        mode: "preview",
        productEnv: "qa",
      }),
    ).toThrow();
  });
});

describe("resolveWebProviderProductPolicy", () => {
  it("returns a valid policy object from runtime env", () => {
    const policy = resolveWebProviderProductPolicy();
    expect(policy.environment).toBeDefined();
    expect(typeof policy.allowAxisPreload).toBe("boolean");
  });
});
