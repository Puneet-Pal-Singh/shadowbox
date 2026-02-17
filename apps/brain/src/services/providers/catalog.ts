/**
 * Provider Model Catalog
 * Static catalog of available models per provider for v1
 */

import type { ProviderId, ModelDescriptor } from "../../schemas/provider";

export const PROVIDER_CATALOG: Record<ProviderId, ModelDescriptor[]> = {
  openrouter: [
    {
      id: "openrouter/auto",
      name: "Auto (Recommended)",
      provider: "openrouter",
      description: "Automatically routes to the best available model",
    },
    {
      id: "openai/gpt-4-turbo-preview",
      name: "GPT-4 Turbo",
      provider: "openrouter",
      contextWindow: 128000,
      costPer1kTokens: { input: 0.01, output: 0.03 },
    },
    {
      id: "openai/gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      provider: "openrouter",
      contextWindow: 4096,
      costPer1kTokens: { input: 0.0005, output: 0.0015 },
    },
    {
      id: "anthropic/claude-3-sonnet",
      name: "Claude 3 Sonnet",
      provider: "openrouter",
      contextWindow: 200000,
      costPer1kTokens: { input: 0.003, output: 0.015 },
    },
  ],
  openai: [
    {
      id: "gpt-4-turbo-preview",
      name: "GPT-4 Turbo",
      provider: "openai",
      contextWindow: 128000,
      costPer1kTokens: { input: 0.01, output: 0.03 },
    },
    {
      id: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      provider: "openai",
      contextWindow: 4096,
      costPer1kTokens: { input: 0.0005, output: 0.0015 },
    },
  ],
};
