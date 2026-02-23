/**
 * Provider Registry v3
 *
 * Extensible provider registry supporting 10+ providers without schema changes.
 * Each provider defines capabilities, auth modes, and model sources independently.
 *
 * Supports:
 * - 50+ providers total (started with 10 core)
 * - Dynamic model lists (static or remote-fetched)
 * - Multiple auth modes (API key, OAuth)
 * - Provider-specific capabilities (streaming, tools, etc.)
 *
 * Usage:
 *   const registry = ProviderRegistryV3.getInstance();
 *   const entry = registry.getProvider('openai');
 *   const allProviders = registry.listProviders();
 */

import { ProviderRegistryEntry } from "@repo/shared-types";

/**
 * Core provider capability set
 */
interface ProviderCapabilities {
  streaming: boolean;
  tools: boolean;
  jsonMode: boolean;
  structuredOutputs: boolean;
  vision?: boolean;
  reasoning?: boolean;
}

/**
 * Extended provider definition (internal)
 */
interface ProviderEntry extends ProviderRegistryEntry {
  capabilities: ProviderCapabilities;
  defaultModel?: string;
  baseUrl?: string;
  modelFetchUrl?: string; // For remote model lists
  modelFetchIntervalHours?: number;
}

/**
 * Registry of 10+ initial providers
 * Can be extended to 50+ without schema changes
 */
const PROVIDER_REGISTRY: Record<string, ProviderEntry> = {
  // Original 3 core providers
  openai: {
    providerId: "openai",
    displayName: "OpenAI",
    authModes: ["api_key"],
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: true,
      structuredOutputs: true,
      vision: true,
      reasoning: true,
    },
    defaultModel: "gpt-4",
    baseUrl: "https://api.openai.com/v1",
    modelSource: "static",
    keyFormat: { prefix: "sk-" },
  },

  anthropic: {
    providerId: "anthropic",
    displayName: "Anthropic Claude",
    authModes: ["api_key"],
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: true,
      structuredOutputs: true,
      vision: true,
      reasoning: true,
    },
    defaultModel: "claude-3-opus",
    baseUrl: "https://api.anthropic.com",
    modelSource: "static",
    keyFormat: { prefix: "sk-ant-" },
  },

  groq: {
    providerId: "groq",
    displayName: "Groq",
    authModes: ["api_key"],
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: false,
      structuredOutputs: false,
      vision: false,
    },
    defaultModel: "mixtral-8x7b-32768",
    baseUrl: "https://api.groq.com/openai/v1",
    modelSource: "static",
    keyFormat: { prefix: "gsk_" },
  },

  // Expansion providers (7 more, 10 total)
  openrouter: {
    providerId: "openrouter",
    displayName: "OpenRouter",
    authModes: ["api_key"],
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: true,
      structuredOutputs: true,
      vision: true,
    },
    defaultModel: "openrouter/auto",
    baseUrl: "https://openrouter.ai/api/v1",
    modelSource: "static",
    keyFormat: { prefix: "sk-or-" },
    modelFetchUrl: "https://openrouter.ai/api/v1/models",
  },

  cohere: {
    providerId: "cohere",
    displayName: "Cohere",
    authModes: ["api_key"],
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: false,
      structuredOutputs: false,
      vision: false,
    },
    defaultModel: "command-r-plus",
    baseUrl: "https://api.cohere.ai/v1",
    modelSource: "static",
    keyFormat: { prefix: "sk-" },
  },

  huggingface: {
    providerId: "huggingface",
    displayName: "Hugging Face Inference",
    authModes: ["api_key"],
    capabilities: {
      streaming: true,
      tools: false,
      jsonMode: false,
      structuredOutputs: false,
      vision: true,
    },
    defaultModel: "mistralai/Mistral-7B-Instruct-v0.1",
    baseUrl: "https://api-inference.huggingface.co",
    modelSource: "static",
    keyFormat: { prefix: "hf_" },
  },

  mistral: {
    providerId: "mistral",
    displayName: "Mistral AI",
    authModes: ["api_key"],
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: true,
      structuredOutputs: false,
      vision: false,
    },
    defaultModel: "mistral-large-latest",
    baseUrl: "https://api.mistral.ai/v1",
    modelSource: "static",
    keyFormat: { prefix: "sk-" },
  },

  replicate: {
    providerId: "replicate",
    displayName: "Replicate",
    authModes: ["api_key"],
    capabilities: {
      streaming: true,
      tools: false,
      jsonMode: false,
      structuredOutputs: false,
      vision: true,
    },
    baseUrl: "https://api.replicate.com/v1",
    modelSource: "static",
    keyFormat: { prefix: "r8_" },
  },

  deepseek: {
    providerId: "deepseek",
    displayName: "DeepSeek",
    authModes: ["api_key"],
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: true,
      structuredOutputs: false,
      vision: true,
      reasoning: true,
    },
    defaultModel: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    modelSource: "static",
    keyFormat: { prefix: "sk-" },
  },

  xai: {
    providerId: "xai",
    displayName: "xAI Grok",
    authModes: ["api_key"],
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: true,
      structuredOutputs: false,
      vision: false,
    },
    defaultModel: "grok-1",
    baseUrl: "https://api.x.ai/v1",
    modelSource: "static",
    keyFormat: { prefix: "sk-" },
  },

  // Future: OAuth providers
  // ... more providers can be added here
};

/**
 * ProviderRegistryV3 - Extensible provider registry
 */
export class ProviderRegistryV3 {
  private static instance: ProviderRegistryV3 | undefined;
  private static registry: Record<string, ProviderEntry> =
    ProviderRegistryV3.cloneRegistry(PROVIDER_REGISTRY);

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ProviderRegistryV3 {
    if (!ProviderRegistryV3.instance) {
      ProviderRegistryV3.instance = new ProviderRegistryV3();
    }
    return ProviderRegistryV3.instance;
  }

  /**
   * Get a single provider entry
   */
  getProvider(providerId: string): ProviderEntry | null {
    return ProviderRegistryV3.registry[providerId] ?? null;
  }

  /**
   * Get provider in public API format (ProviderRegistryEntry)
   */
  getProviderPublic(providerId: string): ProviderRegistryEntry | null {
    const entry = this.getProvider(providerId);
    if (!entry) return null;
    return this.toPublicEntry(entry);
  }

  /**
   * List all registered providers
   */
  listProviders(): ProviderRegistryEntry[] {
    return Object.values(ProviderRegistryV3.registry).map((entry) =>
      this.toPublicEntry(entry),
    );
  }

  /**
   * Check if provider exists
   */
  hasProvider(providerId: string): boolean {
    return providerId in ProviderRegistryV3.registry;
  }

  /**
   * Get default model for provider
   */
  getDefaultModel(providerId: string): string | undefined {
    const entry = this.getProvider(providerId);
    return entry?.defaultModel;
  }

  /**
   * Get providers with a specific capability
   */
  getProvidersByCapability(
    capability: keyof ProviderCapabilities
  ): ProviderRegistryEntry[] {
    return Object.values(ProviderRegistryV3.registry)
      .filter((entry) => entry.capabilities[capability])
      .map((entry) => this.toPublicEntry(entry));
  }

  /**
   * Count total registered providers
   */
  getProviderCount(): number {
    return Object.keys(ProviderRegistryV3.registry).length;
  }

  /**
   * Add provider at runtime (for testing or dynamic expansion)
   * WARNING: Not persistent, use for testing only
   */
  registerProvider(entry: ProviderEntry): void {
    ProviderRegistryV3.registry[entry.providerId] = {
      ...entry,
      authModes: [...entry.authModes],
      capabilities: { ...entry.capabilities },
      keyFormat: entry.keyFormat ? { ...entry.keyFormat } : undefined,
    };
    console.log(
      `[ProviderRegistryV3] Registered provider: ${entry.providerId}`,
    );
  }

  /**
   * Get internal entry with full capability details
   */
  getProviderInternal(providerId: string): ProviderEntry | null {
    return ProviderRegistryV3.registry[providerId] ?? null;
  }

  /**
   * Reset singleton and registry state (test utility).
   */
  static resetForTests(): void {
    ProviderRegistryV3.instance = undefined;
    ProviderRegistryV3.registry =
      ProviderRegistryV3.cloneRegistry(PROVIDER_REGISTRY);
  }

  private toPublicEntry(entry: ProviderEntry): ProviderRegistryEntry {
    const publicEntry: ProviderRegistryEntry = {
      providerId: entry.providerId,
      displayName: entry.displayName,
      authModes: entry.authModes,
      capabilities: {
        streaming: entry.capabilities.streaming,
        tools: entry.capabilities.tools,
        jsonMode: entry.capabilities.jsonMode,
        structuredOutputs: entry.capabilities.structuredOutputs,
      },
      modelSource: entry.modelFetchUrl ? "remote" : "static",
    };

    if (entry.baseUrl) {
      publicEntry.baseUrl = entry.baseUrl;
    }
    if (entry.keyFormat) {
      publicEntry.keyFormat = { ...entry.keyFormat };
    }
    if (entry.defaultModel) {
      publicEntry.defaultModelId = entry.defaultModel;
    }

    return publicEntry;
  }

  private static cloneRegistry(
    source: Record<string, ProviderEntry>,
  ): Record<string, ProviderEntry> {
    const clonedEntries = Object.entries(source).map(([key, value]) => [
      key,
      {
        ...value,
        authModes: [...value.authModes],
        capabilities: { ...value.capabilities },
        keyFormat: value.keyFormat ? { ...value.keyFormat } : undefined,
      },
    ]);

    return Object.fromEntries(clonedEntries);
  }
}
