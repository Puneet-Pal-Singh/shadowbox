import {
  getBuiltinRegistry,
  type ProviderAdapterFamily,
  type ProviderCapabilityFlags,
  type ProviderRegistryEntry,
  type ProviderValidationAuthMode,
} from "@repo/shared-types";

export interface ProviderValidationConfig {
  endpoint: string;
  authMode: ProviderValidationAuthMode;
  headers?: Record<string, string>;
}

export interface ProviderDiscoveryConfig {
  adapterFamily: ProviderAdapterFamily;
  endpoint?: string;
}

export class ProviderRegistryService {
  private readonly entriesById: Map<string, ProviderRegistryEntry>;

  constructor(entries: ProviderRegistryEntry[] = getBuiltinRegistry().providers) {
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

  getProviderCapabilities(providerId: string): ProviderCapabilityFlags | undefined {
    return this.getProvider(providerId)?.capabilities;
  }

  getDefaultModel(providerId: string): string | undefined {
    return this.getProvider(providerId)?.defaultModelId;
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

  getValidationConfig(providerId: string): ProviderValidationConfig | undefined {
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

function resolveDiscoveryEndpoint(provider: ProviderRegistryEntry): string | undefined {
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
