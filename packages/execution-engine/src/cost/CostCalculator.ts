/**
 * CostCalculator - Dynamic pricing via LiteLLM
 *
 * DESIGN: BYOK-First Architecture
 * - Uses LiteLLM for model pricing (100+ models, 50+ providers)
 * - Pricing auto-updates, no code changes needed
 * - Supports multi-provider BYOK scenario
 * - Real cost tracking from provider metadata
 *
 * SOLID Principles:
 * - SRP: Only calculates costs, doesn't track
 * - OCP: Extensible via LiteLLM pricing data
 * - ISP: Minimal public interface
 */

/**
 * Model pricing info (from LiteLLM or provider API)
 */
export interface ModelPricing {
  model: string
  provider: 'openai' | 'anthropic' | 'groq' | 'openrouter' | 'ollama' | 'other'
  inputTokenPrice: number // USD per 1K tokens
  outputTokenPrice: number // USD per 1K tokens
  lastUpdated: number // timestamp
}

/**
 * TODO: Phase 2.5C - LiteLLM Integration
 *
 * Current: Static pricing (MVP only)
 * Phase 2.5C: Replace with dynamic pricing
 * [ ] Install litellm package
 * [ ] Create PricingFetcher for dynamic pricing
 * [ ] Integrate with provider API endpoints
 * [ ] Cache pricing with TTL (1 day)
 * [ ] Track actual costs from LLM response metadata
 * [ ] Support provider-specific pricing
 */

/**
 * CostCalculator: Calculate costs using dynamic pricing
 * BYOK-aware: Works with any provider user brings
 */
export class CostCalculator {
  /**
   * Provider pricing registry (to be replaced with LiteLLM in Phase 2.5C)
   * For now, we maintain a minimal set for testing
   */
  private static readonly MODEL_PRICING: ModelPricing[] = [
    // OpenAI (as of 2024)
    {
      model: 'gpt-4o',
      provider: 'openai',
      inputTokenPrice: 0.005,
      outputTokenPrice: 0.015,
      lastUpdated: Date.now()
    },
    {
      model: 'gpt-4-turbo',
      provider: 'openai',
      inputTokenPrice: 0.01,
      outputTokenPrice: 0.03,
      lastUpdated: Date.now()
    },
    // Anthropic (as of 2024)
    {
      model: 'claude-3-5-sonnet',
      provider: 'anthropic',
      inputTokenPrice: 0.003,
      outputTokenPrice: 0.015,
      lastUpdated: Date.now()
    },
    // Groq (free tier)
    {
      model: 'llama3-70b',
      provider: 'groq',
      inputTokenPrice: 0,
      outputTokenPrice: 0,
      lastUpdated: Date.now()
    },
    // Ollama (self-hosted, free)
    {
      model: 'llama2',
      provider: 'ollama',
      inputTokenPrice: 0,
      outputTokenPrice: 0,
      lastUpdated: Date.now()
    }
  ]

  /**
   * Calculate cost for model tokens
   * @param model Model name (e.g., 'gpt-4o')
   * @param inputTokens Number of input tokens
   * @param outputTokens Number of output tokens
   * @returns Cost in USD
   */
  static calculateTokenCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = this.getModelPricing(model)
    const inputCost = (inputTokens / 1000) * pricing.inputTokenPrice
    const outputCost = (outputTokens / 1000) * pricing.outputTokenPrice
    return inputCost + outputCost
  }

  /**
   * Calculate compute cost (executor infrastructure)
   * Deprecation path: Will be removed when costs are model-specific
   */
  static calculateComputeCost(
    executor: 'docker' | 'cloud' | 'local',
    durationMs: number
  ): number {
    // BYOK: No infrastructure costs, only model API costs
    // These are kept for backward compatibility but should be $0
    const costPerMs = executor === 'local' ? 0 : 0 // All free for BYOK
    return durationMs * costPerMs
  }

  /**
   * Get pricing for a model
   * TODO: In Phase 2.5C, fetch from LiteLLM pricing API
   */
  private static getModelPricing(model: string): ModelPricing {
    const pricing = this.MODEL_PRICING.find(
      p => p.model.toLowerCase() === model.toLowerCase()
    )
    if (!pricing) {
      throw new Error(
        `Unknown model: ${model}. ` +
        `Phase 2.5C will auto-fetch pricing from LiteLLM. ` +
        `Supported: ${this.listAvailableModels().join(', ')}`
      )
    }
    return pricing
  }

  /**
   * List available models
   * TODO: In Phase 2.5C, fetch from LiteLLM (100+ models)
   */
  static listAvailableModels(): string[] {
    return this.MODEL_PRICING.map(p => p.model)
  }

  /**
   * List supported providers
   * TODO: In Phase 2.5C, integrate all LiteLLM providers
   */
  static listSupportedProviders(): string[] {
    const providers = new Set(this.MODEL_PRICING.map(p => p.provider))
    return Array.from(providers)
  }
}
