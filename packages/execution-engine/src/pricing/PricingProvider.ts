/**
 * PricingProvider - Abstraction for model pricing data
 *
 * SOLID Principles:
 * - SRP: Only responsible for pricing lookup
 * - OCP: Interface allows multiple implementations (Static, Dynamic, LiteLLM)
 * - ISP: Minimal interface, no unnecessary methods
 * - DIP: Implementations depend on this interface contract
 */

import { z } from 'zod'

/**
 * Model pricing data from any provider
 * BYOK-compatible: works with OpenAI, Anthropic, Groq, Ollama, custom
 */
export const ModelPricingDataSchema = z.object({
  model: z.string().min(1, 'model name required'),
  provider: z.string().min(1, 'provider name required'),
  inputPer1k: z.number().nonnegative('input price cannot be negative'),
  outputPer1k: z.number().nonnegative('output price cannot be negative'),
  lastUpdated: z.string().datetime('must be ISO datetime'),
  currency: z.literal('USD')
})

export type ModelPricingData = z.infer<typeof ModelPricingDataSchema>

/**
 * PricingProvider interface
 * Implementations: StaticPricingProvider, LiteLLMPricingProvider, CachingPricingProvider
 *
 * Contract:
 * - All methods async (support for future I/O operations)
 * - Always throw on invalid model/provider combination
 * - Price in USD per 1K tokens
 * - Include lastUpdated timestamp for staleness detection
 */
export interface PricingProvider {
  /**
   * Get pricing for a specific model and provider
   *
   * @param model Model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet')
   * @param provider Provider name (e.g., 'openai', 'anthropic')
   * @returns Pricing data with per-1k-token costs
   * @throws Error if model/provider combination not found
   *
   * Example:
   * ```typescript
   * const pricing = await provider.getPricing('gpt-4o', 'openai')
   * // { model: 'gpt-4o', provider: 'openai', inputPer1k: 0.005, outputPer1k: 0.015, ... }
   * ```
   */
  getPricing(model: string, provider: string): Promise<ModelPricingData>

  /**
   * List all available models across all providers
   *
   * @returns Array of model identifiers (e.g., ['gpt-4o', 'claude-3-5-sonnet'])
   */
  listAvailableModels(): Promise<string[]>

  /**
   * List all supported providers
   *
   * @returns Array of provider names (e.g., ['openai', 'anthropic', 'groq'])
   */
  listSupportedProviders(): Promise<string[]>
}
