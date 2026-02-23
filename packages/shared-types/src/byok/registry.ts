/**
 * Provider Registry
 *
 * Defines the provider registry contract and base provider metadata.
 * The registry is extensible and NOT tied to a fixed enum.
 *
 * Phase 1: Include openai, groq, openrouter
 * Phase 2+: Add 10+ more providers without schema changes
 */

import { z } from "zod";

/**
 * ProviderRegistryEntry - Metadata for a provider (static catalog)
 *
 * Does NOT include secrets or connection status.
 * This is pure provider capability/configuration metadata.
 */
export const ProviderRegistryEntrySchema = z.object({
  /** Unique provider identifier (slug format: `openai`, `groq`, `anthropic`, etc.) */
  providerId: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),

  /** Display name for UI */
  displayName: z.string().min(1).max(256),

  /** Auth modes supported by this provider */
  authModes: z.array(z.enum(["api_key", "oauth"])).min(1),

  /** Optional base URL for custom endpoints */
  baseUrl: z.string().url().optional(),

  /** Key format hints (for validation and UI) */
  keyFormat: z
    .object({
      prefix: z.string().optional(),
      regex: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),

  /** Capability flags */
  capabilities: z.object({
    streaming: z.boolean().default(true),
    tools: z.boolean().default(false),
    jsonMode: z.boolean().default(false),
    structuredOutputs: z.boolean().default(false),
  }),

  /** Model catalog source strategy */
  modelSource: z.enum(["static", "remote"]),

  /** Default model ID if not specified by user */
  defaultModelId: z.string().optional(),
});

export type ProviderRegistryEntry = z.infer<
  typeof ProviderRegistryEntrySchema
>;

/**
 * ProviderRegistry - Catalog of all available providers
 *
 * This is a static catalog that defines what providers are available.
 * It's separate from user credentials (which are dynamic per workspace).
 */
export const ProviderRegistrySchema = z.object({
  providers: z.array(ProviderRegistryEntrySchema),
  generatedAt: z.string().datetime(),
});

export type ProviderRegistry = z.infer<typeof ProviderRegistrySchema>;

/**
 * Built-in provider registry entries (Phase 1)
 *
 * These are the base providers. New providers can be added via
 * ProviderRegistry without code changes.
 */
export const BUILTIN_PROVIDERS: Record<string, ProviderRegistryEntry> = {
  openai: {
    providerId: "openai",
    displayName: "OpenAI",
    authModes: ["api_key"],
    baseUrl: "https://api.openai.com/v1",
    keyFormat: {
      prefix: "sk-",
      description: "OpenAI API key (starts with sk-)",
    },
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: true,
      structuredOutputs: true,
    },
    modelSource: "static",
    defaultModelId: "gpt-4-turbo",
  },

  groq: {
    providerId: "groq",
    displayName: "Groq",
    authModes: ["api_key"],
    baseUrl: "https://api.groq.com/openai/v1",
    keyFormat: {
      prefix: "gsk_",
      description: "Groq API key (starts with gsk_)",
    },
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: false,
      structuredOutputs: false,
    },
    modelSource: "static",
    defaultModelId: "mixtral-8x7b-32768",
  },

  openrouter: {
    providerId: "openrouter",
    displayName: "OpenRouter",
    authModes: ["api_key"],
    baseUrl: "https://openrouter.ai/api/v1",
    keyFormat: {
      prefix: "sk-or-",
      description: "OpenRouter API key (starts with sk-or-)",
    },
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: true,
      structuredOutputs: true,
    },
    modelSource: "remote",
  },

  anthropic: {
    providerId: "anthropic",
    displayName: "Anthropic",
    authModes: ["api_key"],
    baseUrl: "https://api.anthropic.com/v1",
    keyFormat: {
      prefix: "sk-ant-",
      description: "Anthropic API key (starts with sk-ant-)",
    },
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: false,
      structuredOutputs: true,
    },
    modelSource: "static",
    defaultModelId: "claude-3-opus",
  },

  cohere: {
    providerId: "cohere",
    displayName: "Cohere",
    authModes: ["api_key"],
    baseUrl: "https://api.cohere.com",
    keyFormat: {
      description: "Cohere API key",
    },
    capabilities: {
      streaming: true,
      tools: false,
      jsonMode: false,
      structuredOutputs: false,
    },
    modelSource: "remote",
  },

  mistral: {
    providerId: "mistral",
    displayName: "Mistral AI",
    authModes: ["api_key"],
    baseUrl: "https://api.mistral.ai/v1",
    keyFormat: {
      description: "Mistral API key",
    },
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: false,
      structuredOutputs: false,
    },
    modelSource: "remote",
  },

  google: {
    providerId: "google",
    displayName: "Google AI (Gemini)",
    authModes: ["api_key"],
    baseUrl: "https://generativelanguage.googleapis.com",
    keyFormat: {
      description: "Google AI API key",
    },
    capabilities: {
      streaming: true,
      tools: true,
      jsonMode: false,
      structuredOutputs: true,
    },
    modelSource: "remote",
  },
};

/**
 * Get builtin registry
 *
 * Returns the static provider registry for Phase 1.
 * In Phase 2+, this would be loaded from a persistent source (D1).
 */
export function getBuiltinRegistry(): ProviderRegistry {
  return {
    providers: Object.values(BUILTIN_PROVIDERS),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Find provider by ID in builtin registry
 *
 * Provider IDs are case-insensitive and normalized to lowercase.
 */
export function findBuiltinProvider(
  providerId: string,
): ProviderRegistryEntry | undefined {
  return BUILTIN_PROVIDERS[providerId.toLowerCase()];
}

/**
 * Validate provider exists in builtin registry
 *
 * Provider IDs are case-insensitive and normalized to lowercase.
 */
export function isKnownProvider(providerId: string): boolean {
  return providerId.toLowerCase() in BUILTIN_PROVIDERS;
}

/**
 * Get all provider IDs in builtin registry
 *
 * Note: All returned IDs are lowercase. Use with `isKnownProvider()` which
 * handles case-insensitive comparison, or manually normalize input before
 * comparing against this list.
 */
export function getKnownProviderIds(): string[] {
  return Object.keys(BUILTIN_PROVIDERS);
}
