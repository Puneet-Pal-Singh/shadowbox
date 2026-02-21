/**
 * AIService - Pure inference layer facade
 *
 * This service:
 * 1. Orchestrates model selection and adapter resolution
 * 2. Delegates text/structured/stream generation to specialized services
 * 3. Returns standardized results including LLMUsage
 * 4. Does NOT perform cost tracking (handled by RunEngine)
 *
 * Design: Thin facade coordinating extraction layer modules.
 * Each generation path is in a dedicated service module.
 * Provider adapter creation is factory-based.
 * SDK calls (generateObject, AI SDK imports) happen here per eslint restrictions.
 */

import { generateObject, type CoreMessage, type CoreTool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ZodSchema } from "zod";
import type { Env } from "../types/ai";
import type { ProviderAdapter } from "./providers";
import type { LLMUsage } from "@shadowbox/execution-engine/runtime/cost";
import { ProviderConfigService } from "./providers";
import {
  createDefaultAdapter,
  resolveModelSelection,
  mapProviderIdToRuntimeProvider,
  getRuntimeProviderFromAdapter,
  selectAdapter,
  generateText,
  type GenerateTextResult,
  createChatStream,
  getSDKModelConfig,
  type SDKModelConfig,
  type GenerateStructuredResult,
} from "./ai";
import { resolveSelectionWithPreferences } from "./ai/preference-selection";

/**
 * AIService - Orchestrates LLM inference through provider adapters
 *
 * Responsibilities:
 * - Model selection (with override support)
 * - Adapter resolution (with fallback logic)
 * - Delegation to specialized generation services
 * - Unified usage tracking
 */
export class AIService {
  private adapter: ProviderAdapter;
  private defaultModel: string;
  private providerConfigService?: ProviderConfigService;

  constructor(
    private env: Env,
    providerConfigService?: ProviderConfigService,
  ) {
    this.adapter = createDefaultAdapter(env);
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
   * @see ModelSelectionPolicy.resolveModelSelection for logic details
   */
  resolveModelSelection(providerId?: string, modelId?: string) {
    return resolveModelSelection(
      providerId,
      modelId,
      this.adapter.provider,
      this.defaultModel,
      mapProviderIdToRuntimeProvider,
      getRuntimeProviderFromAdapter,
    );
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
    const selection = await resolveSelectionWithPreferences({
      providerId,
      modelId: model,
      providerConfigService: this.providerConfigService,
      resolveSelection: (selectedProviderId, selectedModelId) =>
        this.resolveModelSelection(selectedProviderId, selectedModelId),
    });
    const selectedAdapter = await selectAdapter(
      selection,
      this.adapter,
      this.env,
      this.providerConfigService,
    );

    return generateText(selectedAdapter, {
      messages,
      system,
      temperature,
      model: selection.model,
    });
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
    const selection = await resolveSelectionWithPreferences({
      providerId,
      modelId: model,
      providerConfigService: this.providerConfigService,
      resolveSelection: (selectedProviderId, selectedModelId) =>
        this.resolveModelSelection(selectedProviderId, selectedModelId),
    });

    const overrideApiKey = selection.providerId
      ? ((await this.providerConfigService?.getApiKey(
          selection.providerId,
        )) ?? undefined)
      : undefined;

    const sdkModelConfig = getSDKModelConfig(
      selection.model,
      selection.runtimeProvider,
      this.env,
      overrideApiKey,
    );

    const sdkModel = this.createSDKModel(sdkModelConfig);

    const result = await generateObject({
      model: sdkModel,
      messages,
      schema,
      temperature,
    });

    // Standardize usage
    const usage: LLMUsage = {
      provider: selection.runtimeProvider,
      model: selection.model,
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
    const selection = await resolveSelectionWithPreferences({
      providerId,
      modelId: model,
      providerConfigService: this.providerConfigService,
      resolveSelection: (selectedProviderId, selectedModelId) =>
        this.resolveModelSelection(selectedProviderId, selectedModelId),
    });
    const selectedAdapter = await selectAdapter(
      selection,
      this.adapter,
      this.env,
      this.providerConfigService,
    );

    return createChatStream(selectedAdapter, {
      messages,
      system,
      tools,
      temperature,
      model: selection.model,
    }, {
      onFinish,
      onChunk,
    });
  }

  /**
   * Get the underlying provider adapter
   * For advanced use cases
   */
  getProviderAdapter(): ProviderAdapter {
    return this.adapter;
  }

  /**
   * Create an AI SDK model instance from config.
   * Private method - handles SDK instantiation per eslint restrictions.
   */
  private createSDKModel(config: SDKModelConfig) {
    const { provider, apiKey, baseURL, model } = config;

    if (provider === "anthropic") {
      const client = createAnthropic({
        apiKey,
        baseURL, // Support custom base URL for proxies/gateways
      });
      return client(model);
    }

    // OpenAI-compatible providers (openai, openrouter, groq, litellm)
    const client = createOpenAI({
      baseURL,
      apiKey,
    });

    return client(model);
  }
}
export type { GenerateTextResult };
