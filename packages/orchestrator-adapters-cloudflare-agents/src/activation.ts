import type { OrchestratorBackend } from "@shadowbox/orchestrator-core";

export interface CloudflareAgentsActivationInput {
  requestedBackend: OrchestratorBackend;
  featureFlagEnabled: boolean;
}

export function shouldActivateCloudflareAgentsAdapter(
  input: CloudflareAgentsActivationInput,
): boolean {
  return input.featureFlagEnabled && input.requestedBackend === "cloudflare_agents";
}

export function parseCloudflareAgentsFeatureFlag(
  rawValue: string | undefined,
): boolean {
  return rawValue === "true" || rawValue === "1";
}
