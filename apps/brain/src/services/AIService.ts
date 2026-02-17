// apps/brain/src/services/AIService.ts
// Phase 3.1: Pure inference layer using provider adapters
// Returns standardized LLMUsage for cost tracking

import { generateObject, type CoreMessage, type CoreTool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ZodSchema } from "zod";
import type { Env } from "../types/ai";
import type { LLMUsage } from "../core/cost/types";
import {
  LiteLLMAdapter,
  OpenAIAdapter,
  AnthropicAdapter,
  type ProviderAdapter,
  type GenerationParams,
  ProviderError,
} from "./providers";
import { ProviderConfigService } from "./ProviderConfigService";

/**
 * Result from text generation with usage
 */
export interface GenerateTextResult {
  text: string;
  usage: LLMUsage;
  finishReason?: string;
}

/**
 * Result from streaming text generation
 */
export interface GenerateStreamResult {
  stream: ReadableStream<string>;
  finalResult: Promise<GenerateTextResult>;
}

/**
 * Result from structured generation with usage
 */
export interface GenerateStructuredResult<T> {
  object: T;
  usage: LLMUsage;
}

/**
 * AIService - Pure inference layer
 *
 * This service:
 * 1. Selects the appropriate provider adapter based on env config
 * 2. Delegates all LLM calls to the adapter
 * 3. Returns standardized results including LLMUsage
 * 4. Does NOT perform cost tracking (handled by RunEngine)
 *
 * Design: The AIService is a thin wrapper around provider adapters.
 * Cost tracking happens at the RunEngine level via CostTracker.
 */
export class AIService {
  private adapter: ProviderAdapter;
  private defaultModel: string;
  private providerConfigService?: ProviderConfigService;

  constructor(private env: Env, providerConfigService?: ProviderConfigService) {
    this.adapter = this.createAdapter();
    this.defaultModel = env.DEFAULT_MODEL ?? "llama-3.3-70b-versatile";
    this.providerConfigService = providerConfigService;
  }

  /**
   * Get the current provider name
   */
  getProvider(): string {
    return this.adapter.provider;
  }

  /**
   * Get the default model
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Resolve provider/model override selection
   * Returns the model to use, falling back to default if selection is invalid
   *
   * Logic:
   * 1. If providerId + modelId provided AND provider is connected -> use selection
   * 2. Otherwise log warning and fallback to default model
   */
  resolveModelSelection(
    providerId?: string,
    modelId?: string,
  ): { model: string; provider: string; fallback: boolean } {
    // If no override specified, use default
    if (!providerId || !modelId) {
      return {
        model: this.defaultModel,
        provider: this.adapter.provider,
        fallback: false,
      };
    }

    // Check if provider is connected and valid
    if (
      this.providerConfigService &&
      this.providerConfigService.isConnected(providerId as any)
    ) {
      console.log(
        `[ai/service] Using provider override: providerId=${providerId}, modelId=${modelId}`,
      );
      return {
        model: modelId,
        provider: providerId,
        fallback: false,
      };
    }

    // Provider disconnected or invalid - fallback to default
    console.warn(
      `[ai/service] Provider override failed (disconnected or invalid): providerId=${providerId}, modelId=${modelId}. Falling back to default model=${this.defaultModel}`,
    );
    return {
      model: this.defaultModel,
      provider: this.adapter.provider,
      fallback: true,
    };
  }

  /**
   * Generate text with usage tracking
   * Pure inference - no cost tracking
   */
  async generateText({
    messages,
    model,
    temperature = 0.7,
    system,
  }: {
    messages: CoreMessage[];
    model?: string;
    temperature?: number;
    system?: string;
  }): Promise<GenerateTextResult> {
    const selectedModel = model ?? this.defaultModel;

    const params: GenerationParams = {
      messages,
      system,
      temperature,
      model: selectedModel,
    };

    const result = await this.adapter.generate(params);

    return {
      text: result.content,
      usage: result.usage,
      finishReason: result.finishReason,
    };
  }

  /**
   * Generate structured output with usage tracking
   * Pure inference - no cost tracking
   */
  async generateStructured<T>({
    messages,
    schema,
    model,
    temperature = 0.2,
  }: {
    messages: CoreMessage[];
    schema: ZodSchema<T>;
    model?: string;
    temperature?: number;
  }): Promise<GenerateStructuredResult<T>> {
    const selectedModel = model ?? this.defaultModel;

    // For structured generation, we use the AI SDK's generateObject
    // This doesn't go through the provider adapter (yet)
    // TODO: Add structured generation support to provider adapters

    const result = await generateObject({
      model: this.getSDKModel(selectedModel),
      messages,
      schema,
      temperature,
    });

    // Standardize usage
    const usage: LLMUsage = {
      provider: this.adapter.provider,
      model: selectedModel,
      promptTokens: result.usage?.promptTokens ?? 0,
      completionTokens: result.usage?.completionTokens ?? 0,
      totalTokens:
        (result.usage?.promptTokens ?? 0) +
        (result.usage?.completionTokens ?? 0),
    };

    return {
      object: result.object,
      usage,
    };
  }

  /**
   * Create a streaming chat response
   * Pure inference - no cost tracking
   */
  async createChatStream({
    messages,
    system,
    tools,
    model,
    temperature = 0.7,
    onFinish,
    onChunk,
  }: {
    messages: CoreMessage[];
    system?: string;
    tools?: Record<string, CoreTool>;
    model?: string;
    temperature?: number;
    onFinish?: (result: GenerateTextResult) => Promise<void> | void;
    onChunk?: (chunk: {
      content?: string;
      toolCall?: { toolName: string; args: unknown };
    }) => void;
  }): Promise<ReadableStream<Uint8Array>> {
    const selectedModel = model ?? this.defaultModel;

    const params: GenerationParams = {
      messages,
      system,
      tools,
      temperature,
      model: selectedModel,
    };

    const encoder = new TextEncoder();
    let accumulatedText = "";
    let finalUsage: LLMUsage | undefined;
    let finalFinishReason: string | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          const generator = this.adapter.generateStream(params);

          for await (const chunk of generator) {
            switch (chunk.type) {
              case "text":
                if (chunk.content) {
                  accumulatedText += chunk.content;
                  controller.enqueue(encoder.encode(chunk.content));
                  if (onChunk) {
                    onChunk({ content: chunk.content });
                  }
                }
                break;

              case "tool-call":
                if (onChunk && chunk.toolCall) {
                  onChunk({ toolCall: chunk.toolCall });
                }
                break;

              case "finish":
                finalUsage = chunk.usage;
                finalFinishReason = chunk.finishReason;
                break;
            }
          }

          const finalResult: GenerateTextResult = {
            text: accumulatedText,
            usage: finalUsage ?? {
              provider: this.adapter.provider,
              model: selectedModel,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
            finishReason: finalFinishReason,
          };

          if (onFinish) {
            await onFinish(finalResult);
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return stream;
  }

  /**
   * Get the underlying provider adapter
   * For advanced use cases
   */
  getProviderAdapter(): ProviderAdapter {
    return this.adapter;
  }

  /**
   * Create the appropriate provider adapter based on env config
   */
  private createAdapter(): ProviderAdapter {
    const provider = this.env.LLM_PROVIDER ?? "litellm";

    switch (provider) {
      case "litellm":
        return this.createLiteLLMAdapter();

      case "openai":
        return this.createOpenAIAdapter();

      case "anthropic":
        return this.createAnthropicAdapter();

      default:
        console.warn(
          `[ai/service] Unknown provider "${provider}", falling back to LiteLLM`,
        );
        return this.createLiteLLMAdapter();
    }
  }

  private createLiteLLMAdapter(): LiteLLMAdapter {
    const apiKey = this.env.GROQ_API_KEY ?? this.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderError(
        "litellm",
        "Missing GROQ_API_KEY or OPENAI_API_KEY",
      );
    }

    const baseURL =
      this.env.LITELLM_BASE_URL ?? "https://api.groq.com/openai/v1";

    const defaultModel = this.env.DEFAULT_MODEL;
    if (!defaultModel) {
      throw new ProviderError(
        "litellm",
        "DEFAULT_MODEL is required for LiteLLM provider",
      );
    }

    return new LiteLLMAdapter({
      apiKey,
      baseURL,
      defaultModel,
    });
  }

  private createOpenAIAdapter(): OpenAIAdapter {
    const apiKey = this.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderError("openai", "Missing OPENAI_API_KEY");
    }

    return new OpenAIAdapter({
      apiKey,
      defaultModel: this.env.DEFAULT_MODEL,
    });
  }

  private createAnthropicAdapter(): AnthropicAdapter {
    const apiKey = this.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ProviderError("anthropic", "Missing ANTHROPIC_API_KEY");
    }

    return new AnthropicAdapter({
      apiKey,
      defaultModel: this.env.DEFAULT_MODEL,
    });
  }

  /**
   * Get the appropriate AI SDK model for structured generation
   * Uses the configured provider from env
   */
  private getSDKModel(model: string) {
    const provider = this.env.LLM_PROVIDER ?? "litellm";
    const selectedModel = model ?? this.defaultModel;

    switch (provider) {
      case "anthropic":
        return this.getAnthropicModel(selectedModel);
      case "openai":
        return this.getOpenAICompatibleModel(selectedModel, "openai");
      case "litellm":
      default:
        return this.getOpenAICompatibleModel(selectedModel, "litellm");
    }
  }

  private getOpenAICompatibleModel(model: string, provider: string) {
    let apiKey: string;
    let baseURL: string;

    if (provider === "openai") {
      apiKey = this.env.OPENAI_API_KEY ?? "";
      if (!apiKey) {
        throw new ProviderError("openai", "Missing OPENAI_API_KEY");
      }
      baseURL = "https://api.openai.com/v1";
    } else {
      apiKey = this.env.GROQ_API_KEY ?? this.env.OPENAI_API_KEY ?? "";
      if (!apiKey) {
        throw new ProviderError(
          "litellm",
          "Missing GROQ_API_KEY or OPENAI_API_KEY",
        );
      }
      baseURL = this.env.LITELLM_BASE_URL ?? "https://api.groq.com/openai/v1";
    }

    const client = createOpenAI({
      baseURL,
      apiKey,
    });

    return client(model);
  }

  private getAnthropicModel(model: string) {
    const apiKey = this.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ProviderError("anthropic", "Missing ANTHROPIC_API_KEY");
    }

    const client = createAnthropic({
      apiKey,
    });

    return client(model);
  }
}

export class AIServiceError extends Error {
  constructor(message: string) {
    super(`[ai/service] ${message}`);
    this.name = "AIServiceError";
  }
}
