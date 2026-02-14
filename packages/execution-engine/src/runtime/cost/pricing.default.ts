import type { PricingEntry } from "./types.js";

export const DEFAULT_SEED_PRICING: Record<string, PricingEntry> = {
  "openai:gpt-4o": {
    inputPrice: 0.0025,
    outputPrice: 0.01,
    currency: "USD",
    effectiveDate: "2026-02-14",
    lastUpdated: "2026-02-14",
    metadata: {
      source: "openai-public-pricing",
      version: "2026-02-14",
    },
  },
  "openai:gpt-4o-mini": {
    inputPrice: 0.00015,
    outputPrice: 0.0006,
    currency: "USD",
    effectiveDate: "2026-02-14",
    lastUpdated: "2026-02-14",
    metadata: {
      source: "openai-public-pricing",
      version: "2026-02-14",
    },
  },
  "anthropic:claude-3-5-sonnet-20241022": {
    inputPrice: 0.003,
    outputPrice: 0.015,
    currency: "USD",
    effectiveDate: "2026-02-14",
    lastUpdated: "2026-02-14",
    metadata: {
      source: "anthropic-public-pricing",
      version: "2026-02-14",
    },
  },
  "litellm:llama-3.3-70b-versatile": {
    inputPrice: 0.00088,
    outputPrice: 0.00088,
    currency: "USD",
    effectiveDate: "2026-02-14",
    lastUpdated: "2026-02-14",
    metadata: {
      source: "litellm-fallback-registry",
      version: "2026-02-14",
    },
  },
};
