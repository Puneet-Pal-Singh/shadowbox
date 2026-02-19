/**
 * StructuredGenerationService - Structured output generation
 *
 * Single Responsibility: Generate typed JSON objects using schema validation.
 * Uses Vercel AI SDK for structured generation.
 */

import { generateObject, type CoreMessage } from "ai";
import type { ZodSchema } from "zod";
import type { Env } from "../../types/ai";
import type { LLMUsage } from "../../core/cost/types";
import { createSDKModel } from "./SDKModelFactory";
import type { RuntimeProvider } from "./ModelSelectionPolicy";

/**
 * Result from structured generation with usage
 */
export interface GenerateStructuredResult<T> {
  object: T;
  usage: LLMUsage;
}

/**
 * Generate structured output using schema validation.
 *
 * @param model - The model name to use
 * @param provider - The runtime provider type
 * @param env - Cloudflare environment
 * @param params - Generation parameters
 * @param overrideApiKey - Optional override API key for BYOK
 * @returns Result with typed object and usage
 */
export async function generateStructured<T>({
  model,
  provider,
  env,
  params,
  overrideApiKey,
}: {
  model: string;
  provider: RuntimeProvider;
  env: Env;
  params: {
    messages: CoreMessage[];
    schema: ZodSchema<T>;
    temperature?: number;
  };
  overrideApiKey?: string;
}): Promise<GenerateStructuredResult<T>> {
  const sdkModel = createSDKModel(model, provider, env, overrideApiKey);

  const result = await generateObject({
    model: sdkModel,
    messages: params.messages,
    schema: params.schema,
    temperature: params.temperature ?? 0.2,
  });

  // Standardize usage
  const usage: LLMUsage = {
    provider,
    model,
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
