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
  "openrouter:arcee-ai/trinity-large-preview:free": {
    inputPrice: 0,
    outputPrice: 0,
    currency: "USD",
    effectiveDate: "2026-02-26",
    lastUpdated: "2026-02-26",
    metadata: {
      source: "openrouter-free-tier",
      version: "2026-02-26",
    },
  },
  "litellm:arcee-ai/trinity-large-preview:free": {
    inputPrice: 0,
    outputPrice: 0,
    currency: "USD",
    effectiveDate: "2026-02-26",
    lastUpdated: "2026-02-26",
    metadata: {
      source: "litellm-free-tier-fallback",
      version: "2026-02-26",
    },
  },
  "axis:z-ai/glm-4.5-air:free": {
    inputPrice: 0,
    outputPrice: 0,
    currency: "USD",
    effectiveDate: "2026-03-12",
    lastUpdated: "2026-03-12",
    metadata: {
      source: "axis-curated-free-tier",
      version: "2026-03-12",
    },
  },
  "axis:nvidia/nemotron-3-nano-30b-a3b:free": {
    inputPrice: 0,
    outputPrice: 0,
    currency: "USD",
    effectiveDate: "2026-03-12",
    lastUpdated: "2026-03-12",
    metadata: {
      source: "axis-curated-free-tier",
      version: "2026-03-12",
    },
  },
  "axis:nvidia/nemotron-3-super-120b-a12b:free": {
    inputPrice: 0,
    outputPrice: 0,
    currency: "USD",
    effectiveDate: "2026-03-12",
    lastUpdated: "2026-03-12",
    metadata: {
      source: "axis-curated-free-tier",
      version: "2026-03-12",
    },
  },
  "axis:arcee-ai/trinity-large-preview:free": {
    inputPrice: 0,
    outputPrice: 0,
    currency: "USD",
    effectiveDate: "2026-03-12",
    lastUpdated: "2026-03-12",
    metadata: {
      source: "axis-curated-free-tier",
      version: "2026-03-12",
    },
  },
  "axis:stepfun/step-3.5-flash:free": {
    inputPrice: 0,
    outputPrice: 0,
    currency: "USD",
    effectiveDate: "2026-03-12",
    lastUpdated: "2026-03-12",
    metadata: {
      source: "axis-curated-free-tier",
      version: "2026-03-12",
    },
  },
};
