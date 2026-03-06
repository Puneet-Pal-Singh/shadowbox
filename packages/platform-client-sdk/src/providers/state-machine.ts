export const PROVIDER_LIFECYCLE_STEPS = [
  "discover_providers",
  "connect_credential",
  "validate_credential",
  "select_default",
  "resolve_for_run",
  "disconnect",
] as const;

export type ProviderLifecycleStep = (typeof PROVIDER_LIFECYCLE_STEPS)[number];

export interface ProviderLifecycleState {
  step: ProviderLifecycleStep;
  selectedProviderId?: string;
  selectedModelId?: string;
  connectedCredentialIds: string[];
}

export function createInitialProviderLifecycleState(): ProviderLifecycleState {
  return {
    step: "discover_providers",
    connectedCredentialIds: [],
  };
}

export function isProviderLifecycleStep(value: string): value is ProviderLifecycleStep {
  return PROVIDER_LIFECYCLE_STEPS.includes(value as ProviderLifecycleStep);
}
