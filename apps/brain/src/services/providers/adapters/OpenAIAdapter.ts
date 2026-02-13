// apps/brain/src/services/providers/adapters/OpenAIAdapter.ts
// Phase 3.1: Direct OpenAI provider adapter with standardized usage

import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { generateText, streamText, type CoreMessage, type CoreTool } from "ai";
import type {
  ProviderAdapter,
  GenerationParams,
  GenerationResult,
  StreamChunk,
} from "../base/ProviderAdapter";
import type { LLMUsage } from "../../../core/cost/types";

interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
}

/**
 * OpenAI Adapter - Direct OpenAI API integration
 *
 * Features:
 * - Standardizes token usage to LLMUsage format
 * - Returns cost-calculable metadata
 * - Supports both streaming and non-streaming generation
 */
export class OpenAIAdapter implements ProviderAdapter {
  readonly provider = "openai";
  readonly supportedModels: string[];
  private client: OpenAIProvider;
  private defaultModel: string;

  constructor(config: OpenAIConfig) {
    this.client = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.defaultModel = config.defaultModel ?? "gpt-4o-mini";

    this.supportedModels = [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4-turbo-preview",
      "gpt-4",
      "gpt-3.5-turbo",
      "gpt-3.5-turbo-0125",
    ];
  }

  supportsModel(model: string): boolean {
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

    // Standardize usage to LLMUsage format
    const usage = this.standardizeUsage(result.usage, model);

    return {
      content: result.text,
      usage,
      finishReason: result.finishReason,
      toolCalls: result.toolCalls?.map((tc) => ({
        toolName: tc.toolName,
        args: tc.args,
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
      switch (chunk.type) {
        case "text-delta":
          fullText += chunk.textDelta;
          yield {
            type: "text",
            content: chunk.textDelta,
          };
          break;

        case "tool-call":
          yield {
            type: "tool-call",
            toolCall: {
              toolName: chunk.toolName,
              args: chunk.args,
            },
          };
          break;

        case "finish":
          finishReason = chunk.finishReason;
          // Usage available at finish
          if (chunk.usage) {
            finalUsage = this.standardizeUsage(chunk.usage, model);
            yield {
              type: "finish",
              usage: finalUsage,
              finishReason: chunk.finishReason,
            };
          }
          break;
      }
    }

    // Get final result
    const [finalUsageResult, finalText, finalFinishReason, finalToolCalls] =
      await Promise.all([
        streamResult.usage,
        streamResult.text,
        streamResult.finishReason,
        streamResult.toolCalls,
      ]);

    if (!finalUsage) {
      finalUsage = this.standardizeUsage(finalUsageResult, model);
    }

    return {
      content: fullText || finalText,
      usage: finalUsage,
      finishReason: finishReason ?? finalFinishReason,
      toolCalls: finalToolCalls?.map(
        (tc: { toolName: string; args: unknown }) => ({
          toolName: tc.toolName,
          args: tc.args,
        }),
      ),
    };
  }

  /**
   * Standardize AI SDK usage to LLMUsage format
   */
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
      // OpenAI doesn't provide cost directly, PricingRegistry will calculate
      raw: usage,
    };
  }
}
