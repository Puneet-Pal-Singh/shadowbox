/**
 * CostCalculator - Model pricing rules and cost calculations
 *
 * SOLID Principles:
 * - SRP: Only calculates costs, doesn't track or accumulate
 * - OCP: Extensible for new models via pricing registry
 * - ISP: Clients only call methods they need (calculateTokenCost, calculateComputeCost)
 */

/**
 * Pricing for a specific model
 */
export interface ModelPricing {
  model: string
  inputTokenPrice: number // USD per 1K tokens
  outputTokenPrice: number // USD per 1K tokens
  enabled: boolean
}

/**
 * Compute pricing (executor-specific)
 */
export interface ComputePricing {
  executor: 'docker' | 'cloud' | 'local'
  costPerMs: number // USD per millisecond
  enabled: boolean
}

/**
 * CostCalculator: Single responsibility = calculate costs
 * Does NOT track costs or make routing decisions
 */
export class CostCalculator {
  /**
   * Model pricing registry
   * Add more models as needed
   */
  private static readonly MODEL_PRICING: ModelPricing[] = [
    {
      model: 'gpt-4',
      inputTokenPrice: 0.03, // $0.03 per 1K input tokens
      outputTokenPrice: 0.06, // $0.06 per 1K output tokens
      enabled: true
    },
    {
      model: 'gpt-4-turbo',
      inputTokenPrice: 0.01,
      outputTokenPrice: 0.03,
      enabled: true
    },
    {
      model: 'gpt-3.5-turbo',
      inputTokenPrice: 0.0005,
      outputTokenPrice: 0.0015,
      enabled: true
    },
    {
      model: 'claude-3-opus',
      inputTokenPrice: 0.015,
      outputTokenPrice: 0.075,
      enabled: true
    },
    {
      model: 'claude-3-sonnet',
      inputTokenPrice: 0.003,
      outputTokenPrice: 0.015,
      enabled: true
    }
  ]

  /**
   * Compute pricing per executor
   */
  private static readonly COMPUTE_PRICING: ComputePricing[] = [
    {
      executor: 'cloud',
      costPerMs: 0.000001, // $0.001 per second
      enabled: true
    },
    {
      executor: 'docker',
      costPerMs: 0.0000005, // $0.0005 per second (local is cheaper)
      enabled: true
    },
    {
      executor: 'local',
      costPerMs: 0, // Free
      enabled: true
    }
  ]

  /**
   * Calculate cost for model tokens
   * @param model Model name (e.g., 'gpt-4')
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
   * Calculate compute cost based on execution time
   * @param executor Executor type
   * @param durationMs Duration in milliseconds
   * @returns Cost in USD
   */
  static calculateComputeCost(
    executor: 'docker' | 'cloud' | 'local',
    durationMs: number
  ): number {
    const pricing = this.getComputePricing(executor)
    return durationMs * pricing.costPerMs
  }

  /**
   * Calculate total cost
   * @param model Model name
   * @param executor Executor type
   * @param inputTokens Input tokens
   * @param outputTokens Output tokens
   * @param durationMs Duration in milliseconds
   * @returns Total cost in USD
   */
  static calculateTotalCost(
    model: string,
    executor: 'docker' | 'cloud' | 'local',
    inputTokens: number,
    outputTokens: number,
    durationMs: number
  ): number {
    const tokenCost = this.calculateTokenCost(model, inputTokens, outputTokens)
    const computeCost = this.calculateComputeCost(executor, durationMs)
    return tokenCost + computeCost
  }

  /**
   * Get pricing for a model
   * Throws if model not found
   */
  private static getModelPricing(model: string): ModelPricing {
    const pricing = this.MODEL_PRICING.find(p => p.model === model && p.enabled)
    if (!pricing) {
      throw new Error(`Unknown model or pricing disabled: ${model}`)
    }
    return pricing
  }

  /**
   * Get pricing for a compute executor
   * Throws if executor not found
   */
  private static getComputePricing(executor: 'docker' | 'cloud' | 'local'): ComputePricing {
    const pricing = this.COMPUTE_PRICING.find(p => p.executor === executor && p.enabled)
    if (!pricing) {
      throw new Error(`Unknown executor or pricing disabled: ${executor}`)
    }
    return pricing
  }

  /**
   * List available models for pricing
   */
  static listAvailableModels(): string[] {
    return this.MODEL_PRICING.filter(p => p.enabled).map(p => p.model)
  }

  /**
   * List available executors for pricing
   */
  static listAvailableExecutors(): Array<'docker' | 'cloud' | 'local'> {
    return this.COMPUTE_PRICING.filter(p => p.enabled).map(p => p.executor)
  }
}
