/**
 * Provider Model Catalog
 * Static catalog of available models per provider for v1
 */

import type { ProviderId, ModelDescriptor } from "@repo/shared-types";

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
    {
      id: "google/gemma-2-9b-it:free",
      name: "Gemma 2 9B (Free)",
      provider: "openrouter",
      contextWindow: 8192,
      costPer1kTokens: { input: 0, output: 0 },
      description: "Free model for testing",
    },
  ],
  openai: [
    {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      contextWindow: 128000,
      costPer1kTokens: { input: 0.005, output: 0.015 },
    },
    {
      id: "gpt-4-turbo",
      name: "GPT-4 Turbo",
      provider: "openai",
      contextWindow: 128000,
      costPer1kTokens: { input: 0.01, output: 0.03 },
    },
    {
      id: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      provider: "openai",
      contextWindow: 16385,
      costPer1kTokens: { input: 0.0005, output: 0.0015 },
    },
  ],
  groq: [
    {
      id: "llama-3.3-70b-versatile",
      name: "Llama 3.3 70B (Default)",
      provider: "groq",
      contextWindow: 128000,
      costPer1kTokens: { input: 0.00059, output: 0.00079 },
      description: "Fast and capable for most tasks",
    },
    {
      id: "mixtral-8x7b-32768",
      name: "Mixtral 8x7B",
      provider: "groq",
      contextWindow: 32768,
      costPer1kTokens: { input: 0.00027, output: 0.00027 },
      description: "Cost-effective with good performance",
    },
    {
      id: "gemma2-9b-it",
      name: "Gemma 2 9B IT",
      provider: "groq",
      contextWindow: 8192,
      costPer1kTokens: { input: 0.0001, output: 0.0001 },
      description: "Small, fast, and cost-effective",
    },
  ],
};
