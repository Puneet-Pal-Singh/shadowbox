/**
 * CostTracker - Accumulate execution costs per run
 *
 * SOLID Principles:
 * - SRP: Only tracks costs, doesn't calculate pricing or manage state
 * - OCP: Extensible for new cost types via addCost()
 * - DIP: Depends on Cost abstraction, not on specific calculators
 */

/**
 * Cost entry with metadata
 */
export interface Cost {
  type: 'model_tokens' | 'compute_time' | 'storage' | 'network'
  amount: number
  currency: 'USD' | 'credits'
  timestamp: number
  metadata?: Record<string, unknown>
}

/**
 * Cost summary for a run
 */
export interface CostSummary {
  runId: string
  totalCost: number
  totalCosts: {
    modelTokens: number
    computeTime: number
    storage: number
    network: number
  }
  costBreakdown: Cost[]
  duration: number
  startTime: number
  endTime?: number
}

/**
 * CostTracker: Single responsibility = accumulate costs
 * Does NOT calculate pricing or make routing decisions
 */
export class CostTracker {
  private costs: Cost[] = []
  private readonly runId: string
  private readonly startTime: number

  constructor(runId: string) {
    if (!runId || runId.length < 5) {
      throw new Error('Invalid runId')
    }
    this.runId = runId
    this.startTime = Date.now()
  }

  /**
   * Add a cost entry to tracking
   */
  addCost(cost: Omit<Cost, 'timestamp'>): void {
    this.costs.push({
      ...cost,
      timestamp: Date.now()
    })
  }

  /**
   * Add model token cost
   * @param tokens Number of tokens
   * @param costPerToken Cost per token in USD
   */
  addModelTokensCost(tokens: number, costPerToken: number): void {
    this.addCost({
      type: 'model_tokens',
      amount: tokens * costPerToken,
      currency: 'USD',
      metadata: { tokens, costPerToken }
    })
  }

  /**
   * Add compute time cost
   * @param durationMs Duration in milliseconds
   * @param costPerMs Cost per millisecond in USD
   */
  addComputeTimeCost(durationMs: number, costPerMs: number): void {
    this.addCost({
      type: 'compute_time',
      amount: durationMs * costPerMs,
      currency: 'USD',
      metadata: { durationMs, costPerMs }
    })
  }

  /**
   * Get current cost summary
   */
  getSummary(): CostSummary {
    const modelTokensCost = this.calculateCostByType('model_tokens')
    const computeTimeCost = this.calculateCostByType('compute_time')
    const storageCost = this.calculateCostByType('storage')
    const networkCost = this.calculateCostByType('network')

    return {
      runId: this.runId,
      totalCost: modelTokensCost + computeTimeCost + storageCost + networkCost,
      totalCosts: {
        modelTokens: modelTokensCost,
        computeTime: computeTimeCost,
        storage: storageCost,
        network: networkCost
      },
      costBreakdown: [...this.costs], // Return shallow copy to prevent mutation
      duration: Date.now() - this.startTime,
      startTime: this.startTime
    }
  }

  /**
   * Get final summary with end time
   * Call this when execution is complete
   */
  finalize(): CostSummary {
    const summary = this.getSummary()
    return {
      ...summary,
      endTime: Date.now()
    }
  }

  /**
   * Calculate total cost for a specific type
   */
  private calculateCostByType(type: Cost['type']): number {
    return this.costs
      .filter(cost => cost.type === type)
      .reduce((sum, cost) => sum + cost.amount, 0)
  }
}
