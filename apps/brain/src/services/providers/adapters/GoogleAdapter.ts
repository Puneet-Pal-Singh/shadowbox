import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, streamText } from "ai";
import type {
  ProviderAdapter,
  GenerationParams,
  GenerationResult,
  StreamChunk,
} from "../base/ProviderAdapter";
import { ProviderError } from "../base/ProviderAdapter";
import type { LLMUsage } from "@shadowbox/execution-engine/runtime/cost";
import { LLMUnusableResponseError } from "@shadowbox/execution-engine/runtime/llm";

interface GoogleAdapterConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
}

export class GoogleAdapter implements ProviderAdapter {
  readonly provider = "google";
  readonly supportedModels: string[];
  private readonly client: ReturnType<typeof createGoogleGenerativeAI>;
  private readonly defaultModel: string;

  constructor(config: GoogleAdapterConfig) {
    if (!config.apiKey?.trim()) {
      throw new ProviderError("google", "Missing Google API key");
    }
    this.client = createGoogleGenerativeAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.defaultModel = config.defaultModel ?? "gemini-2.5-flash-lite";
    this.supportedModels = [];
  }

  supportsModel(model: string): boolean {
    if (this.supportedModels.length === 0) {
      return true;
    }
    return this.supportedModels.includes(model);
  }

  async generate(params: GenerationParams): Promise<GenerationResult> {
    const model = params.model ?? this.defaultModel;
    try {
      const result = await generateText({
        model: this.client(model),
        messages: params.messages,
        system: params.system,
        tools: params.tools,
        temperature: params.temperature,
      });

      return {
        content: result.text,
        usage: this.standardizeUsage(result.usage, model),
        finishReason: result.finishReason,
        toolCalls: result.toolCalls?.map((toolCall) => ({
          toolName: toolCall.toolName,
          args: toolCall.args,
        })),
      };
    } catch (error) {
      const unusableResponseError = this.buildUnusableResponseError(error, model);
      if (unusableResponseError) {
        console.warn(
          "[provider/google] Classified unusable Gemini response from Gemini API",
          {
            model,
            anomalyCode: unusableResponseError.anomalyCode,
            finishReason: unusableResponseError.finishReason,
            statusCode: unusableResponseError.statusCode,
          },
        );
        throw unusableResponseError;
      }
      throw error;
    }
  }

  async *generateStream(
    params: GenerationParams,
  ): AsyncGenerator<StreamChunk, GenerationResult, unknown> {
    const model = params.model ?? this.defaultModel;
    const streamResult = streamText({
      model: this.client(model),
      messages: params.messages,
      system: params.system,
      tools: params.tools,
      temperature: params.temperature,
    });

    let fullText = "";
    let finalUsage: LLMUsage | undefined;
    let finishReason: string | undefined;

    for await (const chunk of streamResult.fullStream) {
      const state = this.handleStreamChunk(
        chunk,
        model,
        fullText,
        finalUsage,
      );
      fullText = state.fullText;
      finalUsage = state.finalUsage;
      finishReason = state.finishReason;
      if (state.yieldedChunk) {
        yield state.yieldedChunk;
      }
    }

    return await this.finalizeStreamResult(
      streamResult,
      fullText,
      model,
      finalUsage,
      finishReason,
    );
  }

  private handleStreamChunk(
    chunk: {
      type: string;
      textDelta?: string;
      toolName?: string;
      args?: unknown;
      finishReason?: string;
      usage?: { promptTokens: number; completionTokens: number };
    },
    model: string,
    fullText: string,
    currentUsage: LLMUsage | undefined,
  ): {
    fullText: string;
    finalUsage: LLMUsage | undefined;
    finishReason: string | undefined;
    yieldedChunk?: StreamChunk;
  } {
    switch (chunk.type) {
      case "text-delta":
        return {
          fullText: fullText + (chunk.textDelta ?? ""),
          finalUsage: currentUsage,
          finishReason: undefined,
          yieldedChunk: {
            type: "text",
            content: chunk.textDelta ?? "",
          },
        };

      case "tool-call":
        return {
          fullText,
          finalUsage: currentUsage,
          finishReason: undefined,
          yieldedChunk: {
            type: "tool-call",
            toolCall: {
              toolName: chunk.toolName ?? "",
              args: chunk.args,
            },
          },
        };

      case "finish": {
        const usage = chunk.usage
          ? this.standardizeUsage(chunk.usage, model)
          : currentUsage;
        return {
          fullText,
          finalUsage: usage,
          finishReason: chunk.finishReason,
          yieldedChunk: {
            type: "finish",
            usage,
            finishReason: chunk.finishReason,
          },
        };
      }
    }
    return { fullText, finalUsage: currentUsage, finishReason: undefined };
  }

  private async finalizeStreamResult(
    streamResult: {
      usage: Promise<{ promptTokens: number; completionTokens: number }>;
      text: Promise<string>;
      finishReason: Promise<string>;
      toolCalls: Promise<{ toolName: string; args: unknown }[]>;
    },
    fullText: string,
    model: string,
    existingUsage: LLMUsage | undefined,
    existingFinishReason: string | undefined,
  ): Promise<GenerationResult> {
    const [finalUsageResult, finalText, finalFinishReason, finalToolCalls] =
      await Promise.all([
        streamResult.usage,
        streamResult.text,
        streamResult.finishReason,
        streamResult.toolCalls,
      ]);

    const finalUsage =
      existingUsage ?? this.standardizeUsage(finalUsageResult, model);

    return {
      content: fullText || finalText,
      usage: finalUsage,
      finishReason: existingFinishReason ?? finalFinishReason,
      toolCalls: finalToolCalls?.map((tc) => ({
        toolName: tc.toolName,
        args: tc.args,
      })),
    };
  }

  private standardizeUsage(
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

  private buildUnusableResponseError(
    error: unknown,
    model: string,
  ): LLMUnusableResponseError | null {
    const payload = parseRecoverableGoogleEmptyResponse(error);
    if (!payload) {
      return null;
    }

    return new LLMUnusableResponseError({
      providerId: this.provider,
      modelId: model,
      anomalyCode: "EMPTY_CANDIDATE",
      finishReason: payload.finishReason,
      statusCode: payload.statusCode,
      usage: this.standardizeUsage(
        {
          promptTokens: payload.promptTokens,
          completionTokens: payload.completionTokens,
        },
        model,
      ),
    });
  }
}

interface RecoverableGoogleEmptyResponse {
  promptTokens: number;
  completionTokens: number;
  finishReason?: string;
  statusCode?: number;
}

function parseRecoverableGoogleEmptyResponse(
  error: unknown,
): RecoverableGoogleEmptyResponse | null {
  const responseBody = getErrorStringField(error, "responseBody");
  const statusCode = getErrorNumberField(error, "statusCode");
  if (!responseBody || (statusCode !== undefined && statusCode !== 200)) {
    return null;
  }

  const payload = safeParseGoogleResponsePayload(responseBody);
  if (!payload) {
    return null;
  }

  const firstCandidate = payload.candidates[0];
  if (!firstCandidate) {
    return null;
  }
  const parts = firstCandidate.content?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    return null;
  }

  const promptTokens = payload.usageMetadata?.promptTokenCount ?? 0;
  const totalTokens = payload.usageMetadata?.totalTokenCount ?? promptTokens;

  return {
    promptTokens,
    completionTokens: Math.max(totalTokens - promptTokens, 0),
    finishReason: normalizeGoogleFinishReason(firstCandidate.finishReason),
    statusCode,
  };
}

function safeParseGoogleResponsePayload(
  responseBody: string,
): GoogleResponsePayload | null {
  try {
    const parsed = JSON.parse(responseBody) as unknown;
    return isGoogleResponsePayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

interface GoogleResponsePayload {
  candidates: Array<{
    content?: {
      role?: string;
      parts?: unknown[];
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    totalTokenCount?: number;
  };
}

function isGoogleResponsePayload(value: unknown): value is GoogleResponsePayload {
  if (!isRecord(value)) {
    return false;
  }

  return Array.isArray(value.candidates);
}

function normalizeGoogleFinishReason(finishReason: string | undefined): string | undefined {
  if (!finishReason) {
    return undefined;
  }

  return finishReason.toLowerCase();
}

function getErrorStringField(
  error: unknown,
  field: string,
): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const value = error[field];
  return typeof value === "string" ? value : undefined;
}

function getErrorNumberField(
  error: unknown,
  field: string,
): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const value = error[field];
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
