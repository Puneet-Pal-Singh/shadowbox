// apps/brain/src/services/providers/adapters/LiteLLMAdapter.ts
// Phase 3.1: LiteLLM provider adapter with standardized usage

import type { LLMUsage } from "@shadowbox/execution-engine/runtime/cost";
import {
  OpenAICompatibleAdapter,
  type OpenAICompatibleConfig,
} from "./OpenAICompatibleAdapter";

interface LiteLLMConfig {
  apiKey: string;
  baseURL: string;
  defaultModel: string;
  supportedModels?: string[];
}

export class LiteLLMAdapter extends OpenAICompatibleAdapter {
  readonly provider = "litellm";
  readonly supportedModels: string[];

  constructor(config: LiteLLMConfig) {
    if (!config.defaultModel || config.defaultModel.trim() === "") {
      throw new Error(
        "[adapter/litellm] defaultModel is required and cannot be empty",
      );
    }

    const adapterConfig: OpenAICompatibleConfig = {
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultModel: config.defaultModel,
      supportedModels: config.supportedModels ?? [],
    };
    super(adapterConfig);
    this.supportedModels = config.supportedModels ?? [];
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
