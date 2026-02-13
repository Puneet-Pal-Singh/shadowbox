// apps/brain/src/services/providers/adapters/OpenAIAdapter.ts
// Phase 3.1: Direct OpenAI provider adapter with standardized usage

import { createOpenAI } from "@ai-sdk/openai";
import type { LLMUsage } from "../../../core/cost/types";
import {
  OpenAICompatibleAdapter,
  type OpenAICompatibleConfig,
} from "./OpenAICompatibleAdapter";

interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
}

const DEFAULT_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4-turbo-preview",
  "gpt-4",
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-0125",
];

export class OpenAIAdapter extends OpenAICompatibleAdapter {
  readonly provider = "openai";
  readonly supportedModels: string[];

  constructor(config: OpenAIConfig) {
    const adapterConfig: OpenAICompatibleConfig = {
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultModel: config.defaultModel ?? "gpt-4o-mini",
      supportedModels: DEFAULT_MODELS,
    };
    super(adapterConfig);
    this.supportedModels = DEFAULT_MODELS;
  }

  protected standardizeUsage(
    usage: { promptTokens: number; completionTokens: number },
    model: string,
  ): LLMUsage {
    return {
      provider: this.provider,
      model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.promptTokens + usage.completionTokens,
      raw: usage,
    };
  }
}
