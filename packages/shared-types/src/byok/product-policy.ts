import { z } from "zod";

export const AXIS_PROVIDER_ID = "axis" as const;

export const ProviderProductEnvironmentSchema = z.enum([
  "production",
  "staging",
  "development",
]);
export type ProviderProductEnvironment = z.infer<
  typeof ProviderProductEnvironmentSchema
>;

export const ProviderProductPolicySchema = z.object({
  environment: ProviderProductEnvironmentSchema,
  isByokFirstProduction: z.boolean(),
  showAxisInProductionUi: z.boolean(),
  allowAxisRuntimeFallback: z.boolean(),
  allowAxisPreload: z.boolean(),
  allowAxisInternalOnly: z.boolean(),
});
export type ProviderProductPolicy = z.infer<
  typeof ProviderProductPolicySchema
>;

export function createProviderProductPolicy(
  environment: ProviderProductEnvironment,
): ProviderProductPolicy {
  if (environment === "production") {
    return {
      environment,
      isByokFirstProduction: true,
      showAxisInProductionUi: false,
      allowAxisRuntimeFallback: false,
      allowAxisPreload: false,
      allowAxisInternalOnly: false,
    };
  }

  return {
    environment,
    isByokFirstProduction: false,
    showAxisInProductionUi: true,
    allowAxisRuntimeFallback: true,
    allowAxisPreload: true,
    allowAxisInternalOnly: true,
  };
}

export function canShowProviderInPrimaryUi(
  policy: ProviderProductPolicy,
  providerId: string,
): boolean {
  if (providerId !== AXIS_PROVIDER_ID) {
    return true;
  }

  if (policy.environment === "production") {
    return policy.showAxisInProductionUi;
  }

  return policy.allowAxisInternalOnly;
}

export function canUseProviderAtRuntime(
  policy: ProviderProductPolicy,
  providerId: string,
): boolean {
  if (providerId !== AXIS_PROVIDER_ID) {
    return true;
  }

  if (policy.environment === "production") {
    return (
      policy.allowAxisRuntimeFallback ||
      policy.showAxisInProductionUi ||
      policy.allowAxisInternalOnly
    );
  }

  return policy.allowAxisInternalOnly;
}

export function canUseProviderRuntimeFallback(
  policy: ProviderProductPolicy,
  providerId: string,
): boolean {
  if (providerId !== AXIS_PROVIDER_ID) {
    return true;
  }

  if (policy.environment === "production") {
    return policy.allowAxisRuntimeFallback;
  }

  return policy.allowAxisInternalOnly;
}

export function canPreloadProvider(
  policy: ProviderProductPolicy,
  providerId: string,
): boolean {
  if (providerId !== AXIS_PROVIDER_ID) {
    return true;
  }

  if (policy.environment === "production") {
    return policy.allowAxisPreload;
  }

  return policy.allowAxisInternalOnly;
}
