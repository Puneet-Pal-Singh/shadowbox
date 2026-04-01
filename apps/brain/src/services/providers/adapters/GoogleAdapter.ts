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
      const yielded = this.handleStreamChunk(
        chunk,
        model,
        fullText,
        finalUsage,
      );
      fullText = yielded.fullText;
      finalUsage = yielded.finalUsage;
      finishReason = yielded.finishReason;
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
  } {
    switch (chunk.type) {
      case "text-delta":
        return {
          fullText: fullText + (chunk.textDelta ?? ""),
          finalUsage: currentUsage,
          finishReason: undefined,
        };

      case "tool-call":
        return { fullText, finalUsage: currentUsage, finishReason: undefined };

      case "finish":
        const usage = chunk.usage
          ? this.standardizeUsage(chunk.usage, model)
          : currentUsage;
        return {
          fullText,
          finalUsage: usage,
          finishReason: chunk.finishReason,
        };
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
}
