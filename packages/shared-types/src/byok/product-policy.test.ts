import { describe, expect, it } from "vitest";
import {
  AXIS_PROVIDER_ID,
  canPreloadProvider,
  canShowProviderInPrimaryUi,
  canUseProviderAtRuntime,
  canUseProviderRuntimeFallback,
  createProviderProductPolicy,
} from "./product-policy.js";

describe("BYOK product policy", () => {
  it("enforces BYOK-first axis restrictions in production", () => {
    const policy = createProviderProductPolicy("production");

    expect(policy.isByokFirstProduction).toBe(true);
    expect(canShowProviderInPrimaryUi(policy, AXIS_PROVIDER_ID)).toBe(false);
    expect(canPreloadProvider(policy, AXIS_PROVIDER_ID)).toBe(false);
    expect(canUseProviderRuntimeFallback(policy, AXIS_PROVIDER_ID)).toBe(false);
    expect(canUseProviderAtRuntime(policy, AXIS_PROVIDER_ID)).toBe(false);
    expect(canShowProviderInPrimaryUi(policy, "openai")).toBe(true);
  });

  it("keeps axis available for internal staging/dev workflows", () => {
    const stagingPolicy = createProviderProductPolicy("staging");
    const devPolicy = createProviderProductPolicy("development");

    expect(canShowProviderInPrimaryUi(stagingPolicy, AXIS_PROVIDER_ID)).toBe(
      true,
    );
    expect(canPreloadProvider(stagingPolicy, AXIS_PROVIDER_ID)).toBe(true);
    expect(canUseProviderRuntimeFallback(stagingPolicy, AXIS_PROVIDER_ID)).toBe(
      true,
    );

    expect(canShowProviderInPrimaryUi(devPolicy, AXIS_PROVIDER_ID)).toBe(true);
    expect(canUseProviderAtRuntime(devPolicy, AXIS_PROVIDER_ID)).toBe(true);
  });
});
