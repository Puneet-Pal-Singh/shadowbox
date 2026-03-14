import {
  getBuiltinRegistry,
  type ProviderAdapterFamily,
  type ProviderCapabilityFlags,
  type ProviderRegistryEntry,
  type ProviderValidationAuthMode,
} from "@repo/shared-types";
import type {
  ProviderExecutionProfile,
  ProviderExecutionLaneSupport,
  LLMExecutionLatencyTier,
  LLMExecutionReliabilityTier,
} from "@shadowbox/execution-engine/runtime";

export interface ProviderValidationConfig {
  endpoint: string;
  authMode: ProviderValidationAuthMode;
  headers?: Record<string, string>;
}

export interface ProviderDiscoveryConfig {
  adapterFamily: ProviderAdapterFamily;
  endpoint?: string;
}

const AXIS_ACTION_APPROVED_MODELS = new Set([
  "arcee-ai/trinity-large-preview:free",
  "stepfun/step-3.5-flash:free",
]);

export class ProviderRegistryService {
  private readonly entriesById: Map<string, ProviderRegistryEntry>;

  constructor(
    entries: ProviderRegistryEntry[] = getBuiltinRegistry().providers,
  ) {
    this.entriesById = new Map(
      entries.map((entry) => [entry.providerId, { ...entry }]),
    );
  }

  listProviders(): ProviderRegistryEntry[] {
    return Array.from(this.entriesById.values()).map((entry) => ({ ...entry }));
  }

  listProviderIds(): string[] {
    return Array.from(this.entriesById.keys());
  }

  getProvider(providerId: string): ProviderRegistryEntry | undefined {
    const entry = this.entriesById.get(providerId);
    return entry ? { ...entry } : undefined;
  }

  getProviderCapabilities(
    providerId: string,
  ): ProviderCapabilityFlags | undefined {
    return this.getProvider(providerId)?.capabilities;
  }

  getDefaultModel(providerId: string): string | undefined {
    return this.getProvider(providerId)?.defaultModelId;
  }

  getExecutionProfile(
    providerId: string,
    modelId: string,
  ): ProviderExecutionProfile | undefined {
    const provider = this.getProvider(providerId);
    if (!provider) {
      return undefined;
    }

    const latencyTier = resolveLatencyTier(providerId, modelId);
    const reliabilityTier = resolveReliabilityTier(providerId, modelId);

    return {
      latencyTier,
      reliabilityTier,
      supportedLanes: {
        chat_only: supportedLane(),
        single_agent_action: resolveActionLaneSupport(
          provider,
          modelId,
          reliabilityTier,
        ),
        structured_planning_required: resolveStructuredLaneSupport(
          provider,
          modelId,
          reliabilityTier,
        ),
      },
    };
  }

  isProviderRegistered(providerId: string): boolean {
    return this.entriesById.has(providerId);
  }

  isApiKeyFormatValid(providerId: string, apiKey: string): boolean {
    const entry = this.getProvider(providerId);
    if (!entry) {
      return false;
    }

    const keyFormat = entry.keyFormat;
    if (!keyFormat) {
      return apiKey.length > 0;
    }

    if (keyFormat.prefix && !apiKey.startsWith(keyFormat.prefix)) {
      return false;
    }

    if (keyFormat.regex) {
      try {
        const pattern = new RegExp(keyFormat.regex);
        if (!pattern.test(apiKey)) {
          return false;
        }
      } catch {
        return false;
      }
    }

    return apiKey.length > 0;
  }

  getValidationConfig(
    providerId: string,
  ): ProviderValidationConfig | undefined {
    const provider = this.getProvider(providerId);
    if (!provider?.validation) {
      return undefined;
    }

    return {
      endpoint: provider.validation.endpoint,
      authMode: provider.validation.authMode,
      headers: provider.validation.headers
        ? { ...provider.validation.headers }
        : undefined,
    };
  }

  getDiscoveryConfig(providerId: string): ProviderDiscoveryConfig | undefined {
    const provider = this.getProvider(providerId);
    if (!provider) {
      return undefined;
    }

    return {
      adapterFamily: provider.adapterFamily,
      endpoint: resolveDiscoveryEndpoint(provider),
    };
  }
}

function resolveDiscoveryEndpoint(
  provider: ProviderRegistryEntry,
): string | undefined {
  if (provider.modelsEndpoint) {
    return provider.modelsEndpoint;
  }

  if (!provider.baseUrl) {
    return undefined;
  }

  if (provider.adapterFamily === "openai-compatible") {
    return `${provider.baseUrl.replace(/\/$/, "")}/models`;
  }

  return undefined;
}

function supportedLane(reason?: string): ProviderExecutionLaneSupport {
  return {
    supported: true,
    reason,
  };
}

function blockedLane(reason: string): ProviderExecutionLaneSupport {
  return {
    supported: false,
    reason,
  };
}

function resolveActionLaneSupport(
  provider: ProviderRegistryEntry,
  modelId: string,
  reliabilityTier: LLMExecutionReliabilityTier,
): ProviderExecutionLaneSupport {
  if (!provider.capabilities.tools) {
    return blockedLane("Selected provider does not support tool calling.");
  }

  if (
    provider.providerId === "axis" &&
    !AXIS_ACTION_APPROVED_MODELS.has(modelId)
  ) {
    return blockedLane(
      "Axis free defaults are chat-only unless an explicitly approved action model is selected.",
    );
  }

  if (
    reliabilityTier === "experimental" &&
    !isExplicitlyApprovedActionModel(provider.providerId, modelId)
  ) {
    return blockedLane(
      "Selected model is classified as experimental for execution-critical action turns.",
    );
  }

  return supportedLane();
}

function resolveStructuredLaneSupport(
  provider: ProviderRegistryEntry,
  modelId: string,
  reliabilityTier: LLMExecutionReliabilityTier,
): ProviderExecutionLaneSupport {
  if (!provider.capabilities.tools) {
    return blockedLane("Structured planning requires tool-calling support.");
  }

  if (!provider.capabilities.structuredOutputs) {
    return blockedLane(
      "Structured planning requires structured output support.",
    );
  }

  if (!supportsStructuredPlanningTransport(provider)) {
    return blockedLane(
      "Structured planning requires JSON mode or a native structured-output provider transport.",
    );
  }

  if (isFreeModel(modelId)) {
    return blockedLane(
      "Free-tier models are blocked from structured planning until explicitly approved.",
    );
  }

  if (reliabilityTier === "experimental") {
    return blockedLane(
      "Selected model is classified as experimental for structured planning.",
    );
  }

  return supportedLane();
}

function supportsStructuredPlanningTransport(
  provider: ProviderRegistryEntry,
): boolean {
  return (
    provider.capabilities.jsonMode ||
    provider.adapterFamily === "anthropic-native"
  );
}

function resolveLatencyTier(
  providerId: string,
  modelId: string,
): LLMExecutionLatencyTier {
  if (providerId === "groq") {
    return "fast";
  }
  if (providerId === "axis" || isFreeModel(modelId)) {
    return "slow";
  }
  return "standard";
}

function resolveReliabilityTier(
  providerId: string,
  modelId: string,
): LLMExecutionReliabilityTier {
  if (providerId === "openai" || providerId === "anthropic") {
    return "hardened";
  }
  if (providerId === "groq") {
    return "baseline";
  }
  if (providerId === "axis" || isFreeModel(modelId)) {
    return "experimental";
  }
  return "baseline";
}

function isFreeModel(modelId: string): boolean {
  return modelId.includes(":free");
}

function isExplicitlyApprovedActionModel(
  providerId: string,
  modelId: string,
): boolean {
  return providerId === "axis" && AXIS_ACTION_APPROVED_MODELS.has(modelId);
}
