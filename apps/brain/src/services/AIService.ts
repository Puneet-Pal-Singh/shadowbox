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
import { ProviderIdSchema, type ProviderId } from "../schemas/provider";

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

type RuntimeProvider =
  | "litellm"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "groq";

interface ModelSelection {
  model: string;
  provider: string;
  runtimeProvider: RuntimeProvider;
  fallback: boolean;
  providerId?: ProviderId;
}

/**
 * Provider endpoint configuration for direct inference
 */
interface ProviderEndpointConfig {
  baseURL: string;
  apiKeyPrefix: string;
  requiresApiKey: boolean;
}

/**
 * Direct provider endpoint configurations for BYOK runtime
 */
const PROVIDER_ENDPOINTS: Record<
  Exclude<ProviderId, "openai">,
  ProviderEndpointConfig
> = {
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyPrefix: "sk-or-",
    requiresApiKey: true,
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    apiKeyPrefix: "gsk_",
    requiresApiKey: true,
  },
};

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

  constructor(
    private env: Env,
    providerConfigService?: ProviderConfigService,
  ) {
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
   *
   * NOTE: Does NOT check durable provider state (that's async). Only validates structure.
   */
  resolveModelSelection(providerId?: string, modelId?: string): ModelSelection {
    const defaultRuntimeProvider = this.getRuntimeProviderFromAdapter(
      this.adapter.provider,
    );

    // If no override specified, use default
    if (!providerId || !modelId) {
      return {
        model: this.defaultModel,
        provider: this.adapter.provider,
        runtimeProvider: defaultRuntimeProvider,
        fallback: false,
      };
    }

    // Validate providerId is a known provider
    const parseResult = ProviderIdSchema.safeParse(providerId);
    if (!parseResult.success) {
      console.warn(
        `[ai/service] Invalid providerId: ${providerId}. Falling back to default model=${this.defaultModel}`,
      );
      return {
        model: this.defaultModel,
        provider: this.adapter.provider,
        runtimeProvider: defaultRuntimeProvider,
        fallback: true,
      };
    }

    const validProviderId: ProviderId = parseResult.data;
    const runtimeProvider =
      this.mapProviderIdToRuntimeProvider(validProviderId);

    // Attempt to use provider override (actual connection check happens in getAdapterForSelection)
    console.log(
      `[ai/service] Attempting provider override: providerId=${validProviderId}, modelId=${modelId}`,
    );
    return {
      model: modelId,
      provider: validProviderId,
      runtimeProvider,
      fallback: false,
      providerId: validProviderId,
    };
  }

  /**
   * Generate text with usage tracking
   * Pure inference - no cost tracking
   */
  async generateText({
    messages,
    model,
    providerId,
    temperature = 0.7,
    system,
  }: {
    messages: CoreMessage[];
    model?: string;
    providerId?: string;
    temperature?: number;
    system?: string;
  }): Promise<GenerateTextResult> {
    const selection = this.resolveModelSelection(providerId, model);
    const selectedModel = selection.model;
    const selectedAdapter = await this.getAdapterForSelection(selection);

    const params: GenerationParams = {
      messages,
      system,
      temperature,
      model: selectedModel,
    };

    const result = await selectedAdapter.generate(params);

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
    providerId,
    temperature = 0.2,
  }: {
    messages: CoreMessage[];
    schema: ZodSchema<T>;
    model?: string;
    providerId?: string;
    temperature?: number;
  }): Promise<GenerateStructuredResult<T>> {
    const selection = this.resolveModelSelection(providerId, model);
    const selectedModel = selection.model;
    const selectedProvider = selection.provider;

    // For structured generation, we use the AI SDK's generateObject
    // Fetch provider-aware API key if a provider override is selected
    const overrideApiKey = selection.providerId
      ? ((await this.providerConfigService?.getApiKey(selection.providerId)) ??
        undefined)
      : undefined;

    const result = await generateObject({
      model: this.getSDKModel(
        selectedModel,
        selection.runtimeProvider,
        overrideApiKey,
      ),
      messages,
      schema,
      temperature,
    });

    // Standardize usage
    const usage: LLMUsage = {
      provider: selectedProvider,
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
    providerId,
    temperature = 0.7,
    onFinish,
    onChunk,
  }: {
    messages: CoreMessage[];
    system?: string;
    tools?: Record<string, CoreTool>;
    model?: string;
    providerId?: string;
    temperature?: number;
    onFinish?: (result: GenerateTextResult) => Promise<void> | void;
    onChunk?: (chunk: {
      content?: string;
      toolCall?: { toolName: string; args: unknown };
    }) => void;
  }): Promise<ReadableStream<Uint8Array>> {
    const selection = this.resolveModelSelection(providerId, model);
    const selectedModel = selection.model;
    const selectedAdapter = await this.getAdapterForSelection(selection);

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
          const generator = selectedAdapter.generateStream(params);

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
              provider: selectedAdapter.provider,
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

  private createLiteLLMAdapter(overrideApiKey?: string): LiteLLMAdapter {
    const apiKey =
      overrideApiKey ?? this.env.GROQ_API_KEY ?? this.env.OPENAI_API_KEY;
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

  private createOpenAIAdapter(overrideApiKey?: string): OpenAIAdapter {
    const apiKey = overrideApiKey ?? this.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderError("openai", "Missing OPENAI_API_KEY");
    }

    return new OpenAIAdapter({
      apiKey,
      defaultModel: this.env.DEFAULT_MODEL,
    });
  }

  private createAnthropicAdapter(overrideApiKey?: string): AnthropicAdapter {
    const apiKey = overrideApiKey ?? this.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ProviderError("anthropic", "Missing ANTHROPIC_API_KEY");
    }

    return new AnthropicAdapter({
      apiKey,
      defaultModel: this.env.DEFAULT_MODEL,
    });
  }

  /**
   * Create OpenRouter adapter with direct endpoint
   * Uses user's BYOK for direct inference
   */
  private createOpenRouterAdapter(overrideApiKey?: string): OpenAIAdapter {
    const apiKey = overrideApiKey;
    if (!apiKey) {
      throw new ProviderError(
        "openrouter",
        "OpenRouter provider is not connected. Please connect your OpenRouter API key in settings.",
      );
    }

    // Validate key format
    if (!apiKey.startsWith(PROVIDER_ENDPOINTS.openrouter.apiKeyPrefix)) {
      throw new ProviderError(
        "openrouter",
        `Invalid OpenRouter API key format. Key must start with "${PROVIDER_ENDPOINTS.openrouter.apiKeyPrefix}"`,
      );
    }

    return new OpenAIAdapter({
      apiKey,
      baseURL: PROVIDER_ENDPOINTS.openrouter.baseURL,
      defaultModel: this.env.DEFAULT_MODEL,
    });
  }

  /**
   * Create Groq adapter with direct endpoint
   * Uses user's BYOK for direct inference
   */
  private createGroqAdapter(overrideApiKey?: string): OpenAIAdapter {
    const apiKey = overrideApiKey;
    if (!apiKey) {
      throw new ProviderError(
        "groq",
        "Groq provider is not connected. Please connect your Groq API key in settings.",
      );
    }

    // Validate key format
    if (!apiKey.startsWith(PROVIDER_ENDPOINTS.groq.apiKeyPrefix)) {
      throw new ProviderError(
        "groq",
        `Invalid Groq API key format. Key must start with "${PROVIDER_ENDPOINTS.groq.apiKeyPrefix}"`,
      );
    }

    return new OpenAIAdapter({
      apiKey,
      baseURL: PROVIDER_ENDPOINTS.groq.baseURL,
      defaultModel: this.env.DEFAULT_MODEL ?? "llama-3.3-70b-versatile",
    });
  }

  /**
   * Get the appropriate AI SDK model for structured generation
   * Uses the configured provider from env or override
   */
  private getSDKModel(
    model: string,
    provider: RuntimeProvider,
    overrideApiKey?: string,
  ) {
    const selectedProvider = provider;
    const selectedModel = model ?? this.defaultModel;

    switch (selectedProvider) {
      case "anthropic":
        return this.getAnthropicModel(selectedModel, overrideApiKey);
      case "openai":
        return this.getOpenAICompatibleModel(
          selectedModel,
          "openai",
          overrideApiKey,
        );
      case "openrouter":
        return this.getOpenAICompatibleModel(
          selectedModel,
          "openrouter",
          overrideApiKey,
        );
      case "groq":
        return this.getOpenAICompatibleModel(
          selectedModel,
          "groq",
          overrideApiKey,
        );
      case "litellm":
      default:
        return this.getOpenAICompatibleModel(
          selectedModel,
          "litellm",
          overrideApiKey,
        );
    }
  }

  private getOpenAICompatibleModel(
    model: string,
    provider: string,
    overrideApiKey?: string,
  ) {
    let apiKey: string;
    let baseURL: string;

    if (provider === "openai") {
      apiKey = overrideApiKey ?? this.env.OPENAI_API_KEY ?? "";
      if (!apiKey) {
        throw new ProviderError("openai", "Missing OPENAI_API_KEY");
      }
      baseURL = "https://api.openai.com/v1";
    } else if (provider === "openrouter") {
      apiKey = overrideApiKey ?? "";
      if (!apiKey) {
        throw new ProviderError(
          "openrouter",
          "OpenRouter provider is not connected. Please connect your OpenRouter API key in settings.",
        );
      }
      if (!apiKey.startsWith(PROVIDER_ENDPOINTS.openrouter.apiKeyPrefix)) {
        throw new ProviderError(
          "openrouter",
          `Invalid OpenRouter API key format. Key must start with "${PROVIDER_ENDPOINTS.openrouter.apiKeyPrefix}"`,
        );
      }
      baseURL = PROVIDER_ENDPOINTS.openrouter.baseURL;
    } else if (provider === "groq") {
      apiKey = overrideApiKey ?? "";
      if (!apiKey) {
        throw new ProviderError(
          "groq",
          "Groq provider is not connected. Please connect your Groq API key in settings.",
        );
      }
      if (!apiKey.startsWith(PROVIDER_ENDPOINTS.groq.apiKeyPrefix)) {
        throw new ProviderError(
          "groq",
          `Invalid Groq API key format. Key must start with "${PROVIDER_ENDPOINTS.groq.apiKeyPrefix}"`,
        );
      }
      baseURL = PROVIDER_ENDPOINTS.groq.baseURL;
    } else {
      apiKey =
        overrideApiKey ??
        this.env.GROQ_API_KEY ??
        this.env.OPENAI_API_KEY ??
        "";
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

  private getAnthropicModel(model: string, overrideApiKey?: string) {
    const apiKey = overrideApiKey ?? this.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ProviderError("anthropic", "Missing ANTHROPIC_API_KEY");
    }

    const client = createAnthropic({
      apiKey,
    });

    return client(model);
  }

  private mapProviderIdToRuntimeProvider(
    providerId: ProviderId,
  ): RuntimeProvider {
    switch (providerId) {
      case "openrouter":
        return "openrouter";
      case "groq":
        return "groq";
      case "openai":
        return "openai";
      default: {
        const _exhaustive: never = providerId;
        return _exhaustive;
      }
    }
  }

  private getRuntimeProviderFromAdapter(provider: string): RuntimeProvider {
    if (provider === "openai" || provider === "anthropic") {
      return provider;
    }
    return "litellm";
  }

  private async getAdapterForSelection(
    selection: ModelSelection,
  ): Promise<ProviderAdapter> {
    if (
      selection.fallback ||
      selection.runtimeProvider ===
        this.getRuntimeProviderFromAdapter(this.adapter.provider)
    ) {
      return this.adapter;
    }

    const overrideApiKey = selection.providerId
      ? ((await this.providerConfigService?.getApiKey(selection.providerId)) ??
        undefined)
      : undefined;

    // For all providers, fall back to default if no explicit override key provided
    // This ensures BYOK providers are explicitly connected before use
    if (!overrideApiKey) {
      console.warn(
        `[ai/service] Provider ${selection.runtimeProvider} not connected, falling back to default adapter`,
      );
      return this.adapter;
    }

    switch (selection.runtimeProvider) {
      case "openai":
        return this.createOpenAIAdapter(overrideApiKey);
      case "anthropic":
        return this.createAnthropicAdapter(overrideApiKey);
      case "openrouter":
        return this.createOpenRouterAdapter(overrideApiKey);
      case "groq":
        return this.createGroqAdapter(overrideApiKey);
      case "litellm":
      default:
        return this.createLiteLLMAdapter(overrideApiKey);
    }
  }
}

export class AIServiceError extends Error {
  constructor(message: string) {
    super(`[ai/service] ${message}`);
    this.name = "AIServiceError";
  }
}
