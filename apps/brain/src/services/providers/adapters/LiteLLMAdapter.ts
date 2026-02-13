// apps/brain/src/services/providers/adapters/LiteLLMAdapter.ts
// Phase 3.1: LiteLLM provider adapter with standardized usage

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText, type CoreMessage, type CoreTool } from "ai";
import type {
  ProviderAdapter,
  GenerationParams,
  GenerationResult,
  StreamChunk,
} from "../base/ProviderAdapter";
import type { LLMUsage } from "../../../core/cost/types";

interface LiteLLMConfig {
  apiKey: string;
  baseURL: string;
  defaultModel?: string;
}

/**
 * LiteLLM Adapter - Unified interface for multiple LLM providers via LiteLLM
 *
 * Features:
 * - Standardizes token usage to LLMUsage format
 * - Returns cost-calculable metadata
 * - Supports both streaming and non-streaming generation
 */
export class LiteLLMAdapter implements ProviderAdapter {
  readonly provider = "litellm";
  readonly supportedModels: string[];
  private client: ReturnType<typeof createOpenAI>;
  private defaultModel: string;

  constructor(config: LiteLLMConfig) {
    this.client = createOpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
    });
    this.defaultModel = config.defaultModel ?? "gpt-4o-mini";

    // LiteLLM supports all OpenAI-compatible models
    this.supportedModels = [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-3.5-turbo",
      "claude-3-opus",
      "claude-3-sonnet",
      "claude-3-haiku",
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
      // LiteLLM doesn't provide cost directly, PricingRegistry will calculate
      raw: usage,
    };
  }
}
