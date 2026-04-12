import { describe, expect, it } from "vitest";
import type { Env } from "../types/ai";
import {
  resolveBrainProviderProductEnvironment,
  resolveBrainProviderProductPolicy,
} from "./provider-product-policy";

describe("resolveBrainProviderProductEnvironment", () => {
  it("prefers ENVIRONMENT when set", () => {
    expect(
      resolveBrainProviderProductEnvironment({
        ENVIRONMENT: "staging",
        NODE_ENV: "production",
      }),
    ).toBe("staging");
  });

  it("maps NODE_ENV production to production", () => {
    expect(
      resolveBrainProviderProductEnvironment({
        NODE_ENV: "production",
      }),
    ).toBe("production");
  });

  it("defaults to production when env is unset", () => {
    expect(resolveBrainProviderProductEnvironment({})).toBe("production");
  });
});

describe("resolveBrainProviderProductPolicy", () => {
  it("returns BYOK-first production policy by default", () => {
    const policy = resolveBrainProviderProductPolicy({
      NODE_ENV: "production",
    } as Env);
    expect(policy.environment).toBe("production");
    expect(policy.allowAxisPreload).toBe(false);
  });
});
