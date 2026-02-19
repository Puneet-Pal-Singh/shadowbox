/**
 * TextGenerationService - Pure text generation service
 *
 * Single Responsibility: Generate text responses using provider adapters.
 * Returns standardized LLMUsage for cost tracking.
 */

import type { CoreMessage } from "ai";
import type { LLMUsage } from "../../core/cost/types";
import type { ProviderAdapter, GenerationParams } from "../providers";

/**
 * Result from text generation with usage
 */
export interface GenerateTextResult {
  text: string;
  usage: LLMUsage;
  finishReason?: string;
}

/**
 * Generate text using a provider adapter.
 *
 * @param adapter - The provider adapter to use
 * @param params - Generation parameters
 * @returns Result with text, usage, and finish reason
 */
export async function generateText(
  adapter: ProviderAdapter,
  params: {
    messages: CoreMessage[];
    system?: string;
    temperature?: number;
    model: string;
  },
): Promise<GenerateTextResult> {
  const generationParams: GenerationParams = {
    messages: params.messages,
    system: params.system,
    temperature: params.temperature,
    model: params.model,
  };

  const result = await adapter.generate(generationParams);

  return {
    text: result.content,
    usage: result.usage,
    finishReason: result.finishReason,
  };
}
