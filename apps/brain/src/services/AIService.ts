import { generateObject, type CoreMessage, type CoreTool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ZodSchema } from "zod";
import type { Env } from "../types/ai";
import type {
  ProviderAdapter,
  GenerationParams,
  GenerationResult,
  StreamChunk,
} from "./providers";
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
import {
} from "./ai/defaults";
import { DefaultAdapterService } from "./ai/DefaultAdapterService";
import { inferUsageProvider } from "./ai/usage-provider";

export class AIService {
  private adapter: ProviderAdapter;
  private defaultModel: string;
  private providerConfigService?: ProviderConfigService;

  constructor(
    private env: Env,
    providerConfigService?: ProviderConfigService,
  ) {
    this.adapter = DefaultAdapterService.createResillient(env);
    this.defaultModel = env.DEFAULT_MODEL ?? "model-unset";
    this.providerConfigService = providerConfigService;
  }

  getProvider(): string {
    return this.adapter.provider;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  resolveModelSelection(providerId?: string, modelId?: string, isByokOverride = false) {
    const options = isByokOverride ? { isByokOverride } : undefined;
    return resolveModelSelection(
      providerId,
      modelId,
      this.adapter.provider,
      this.defaultModel,
      mapProviderIdToRuntimeProvider,
      getRuntimeProviderFromAdapter,
      options,
    );
  }

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
      selection.providerId,
    );

    const sdkModel = this.createSDKModel(sdkModelConfig);

    const result = await generateObject({
      model: sdkModel,
      messages,
      schema,
      temperature,
      // OpenRouter often rejects tool-based structured generation for some models.
      // Force JSON mode for OpenAI-compatible providers to avoid `tool_choice` routing failures.
      ...(selection.runtimeProvider === "anthropic"
        ? {}
        : { mode: "json" as const }),
    });

    // Standardize usage
    const usage: LLMUsage = {
      provider: inferUsageProvider(
        selection.runtimeProvider,
        selection.providerId,
        sdkModelConfig.baseURL,
      ),
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

    return createChatStream(
      selectedAdapter,
      {
        messages,
        system,
        tools,
        temperature,
        model: selection.model,
      },
      {
        onFinish,
        onChunk,
      },
    );
  }

  getProviderAdapter(): ProviderAdapter {
    return this.adapter;
  }

  private createSDKModel(config: SDKModelConfig) {
    const { provider, apiKey, baseURL, model } = config;

    if (provider === "anthropic-native") {
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
