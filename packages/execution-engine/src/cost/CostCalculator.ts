/**
 * CostCalculator - Calculate token costs using pluggable pricing provider
 *
 * DESIGN: BYOK-First Architecture
 * - Uses PricingProvider abstraction for pricing (OpenAI, Anthropic, Groq, Ollama, etc.)
 * - Supports StaticPricingProvider (MVP) and future dynamic providers
 * - Supports multi-provider BYOK scenario
 * - Future: LiteLLM integration for 100+ models in Phase 3
 *
 * SOLID Principles:
 * - SRP: Only calculates costs from pricing data
 * - OCP: Extensible via PricingProvider implementations
 * - DIP: Depends on PricingProvider interface, not concrete implementations
 * - ISP: Minimal interface for callers
 */

import type { PricingProvider } from '../pricing/PricingProvider.js'

/**
 * Token divisor for per-1k pricing calculations
 * All pricing is expressed as cost per 1000 tokens
 */
const TOKENS_PER_1K = 1000

/**
 * CostCalculator: Token cost calculation using pluggable pricing
 * Instance-based (not static) to support dependency injection
 *
 * Example:
 * ```typescript
 * const provider = new StaticPricingProvider()
 * const calculator = new CostCalculator(provider)
 * const cost = await calculator.calculateTokenCost('gpt-4o', 'openai', 1000, 500)
 * ```
 */
export class CostCalculator {
  /**
   * @param pricingProvider Provider for model pricing data
   * @throws If pricingProvider is falsy
   */
  constructor(private readonly pricingProvider: PricingProvider) {
    if (!pricingProvider) {
      throw new Error('PricingProvider required for CostCalculator')
    }
  }

  /**
   * Calculate cost for model tokens
   *
   * @param model Model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet')
   * @param provider Provider name (e.g., 'openai', 'anthropic')
   * @param inputTokens Number of input tokens
   * @param outputTokens Number of output tokens
   * @returns Cost in USD
   * @throws If model/provider not found in pricing provider
   *
   * Formula:
   * ```
   * cost = (inputTokens / 1000) * inputPer1k + (outputTokens / 1000) * outputPer1k
   * ```
   */
  async calculateTokenCost(
    model: string,
    provider: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<number> {
    const pricing = await this.pricingProvider.getPricing(model, provider)
    const inputCost = (inputTokens / TOKENS_PER_1K) * pricing.inputPer1k
    const outputCost = (outputTokens / TOKENS_PER_1K) * pricing.outputPer1k
    return inputCost + outputCost
  }

  /**
   * List all available models
   */
  async listAvailableModels(): Promise<string[]> {
    return this.pricingProvider.listAvailableModels()
  }

  /**
   * List all supported providers
   */
  async listSupportedProviders(): Promise<string[]> {
    return this.pricingProvider.listSupportedProviders()
  }
}
