/**
 * Cost Types Tests
 * Validates cost calculation and Zod schemas
 */

import {
  ModelPricingSchema,
  CostEntrySchema,
  ModelUsageSchema,
  ExecutionCostSchema,
  SandboxCostConfigSchema,
  MODEL_PRICING,
  getModelPricing,
  calculateTokenCost,
  calculateSandboxCost
} from '../src/types/cost.js'

describe('ModelPricingSchema', () => {
  it('validates correct pricing', () => {
    const pricing = {
      inputTokenPrice: 0.01,
      outputTokenPrice: 0.02
    }
    const result = ModelPricingSchema.safeParse(pricing)
    expect(result.success).toBe(true)
  })

  it('rejects negative input price', () => {
    const pricing = {
      inputTokenPrice: -0.01,
      outputTokenPrice: 0.02
    }
    const result = ModelPricingSchema.safeParse(pricing)
    expect(result.success).toBe(false)
  })

  it('allows zero prices', () => {
    const pricing = {
      inputTokenPrice: 0,
      outputTokenPrice: 0
    }
    const result = ModelPricingSchema.safeParse(pricing)
    expect(result.success).toBe(true)
  })
})

describe('MODEL_PRICING Constant', () => {
  it('contains GPT models', () => {
    expect(MODEL_PRICING['gpt-4']).toBeDefined()
    expect(MODEL_PRICING['gpt-3.5-turbo']).toBeDefined()
  })

  it('contains Claude models', () => {
    expect(MODEL_PRICING['claude-3-opus']).toBeDefined()
    expect(MODEL_PRICING['claude-3-sonnet']).toBeDefined()
  })

  it('all entries are valid ModelPricing', () => {
    Object.entries(MODEL_PRICING).forEach(([modelName, pricing]) => {
      const result = ModelPricingSchema.safeParse(pricing)
      expect(result.success).toBe(true, `Model ${modelName} has invalid pricing`)
    })
  })

  it('prices are non-negative', () => {
    Object.entries(MODEL_PRICING).forEach(([modelName, pricing]) => {
      expect(pricing.inputTokenPrice).toBeGreaterThanOrEqual(0)
      expect(pricing.outputTokenPrice).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('getModelPricing', () => {
  it('returns pricing for known model', () => {
    const pricing = getModelPricing('gpt-4')
    expect(pricing.inputTokenPrice).toBeGreaterThan(0)
    expect(pricing.outputTokenPrice).toBeGreaterThan(0)
  })

  it('throws for unknown model', () => {
    expect(() => getModelPricing('unknown-model')).toThrow('Pricing not found for model: unknown-model')
  })

  it('returns consistent pricing', () => {
    const pricing1 = getModelPricing('claude-3-sonnet')
    const pricing2 = getModelPricing('claude-3-sonnet')
    expect(pricing1).toEqual(pricing2)
  })
})

describe('calculateTokenCost', () => {
  it('calculates cost correctly for GPT-4', () => {
    // 1000 tokens split evenly: 500 input, 500 output
    // input: 500 * 0.03/1000 = 0.015
    // output: 500 * 0.06/1000 = 0.03
    // total: 0.045
    const cost = calculateTokenCost(1000, 'gpt-4')
    expect(cost).toBeCloseTo(0.045, 5)
  })

  it('calculates cost for zero tokens', () => {
    const cost = calculateTokenCost(0, 'gpt-4')
    expect(cost).toBe(0)
  })

  it('calculates cost for Claude model', () => {
    const cost = calculateTokenCost(1000, 'claude-3-sonnet')
    expect(cost).toBeGreaterThan(0)
  })

  it('throws for unknown model', () => {
    expect(() => calculateTokenCost(1000, 'unknown')).toThrow()
  })

  it('scales cost with token count', () => {
    const cost1 = calculateTokenCost(1000, 'gpt-3.5-turbo')
    const cost2 = calculateTokenCost(2000, 'gpt-3.5-turbo')
    expect(cost2).toBeCloseTo(cost1 * 2, 5)
  })
})

describe('calculateSandboxCost', () => {
  it('calculates hourly cost correctly', () => {
    // 1 hour at $1/hour = $1
    const cost = calculateSandboxCost(1000 * 60 * 60, 1)
    expect(cost).toBeCloseTo(1, 5)
  })

  it('calculates fractional hour cost', () => {
    // 30 minutes at $1/hour = $0.50
    const cost = calculateSandboxCost(30 * 60 * 1000, 1)
    expect(cost).toBeCloseTo(0.5, 5)
  })

  it('calculates zero cost for zero duration', () => {
    const cost = calculateSandboxCost(0, 10)
    expect(cost).toBe(0)
  })

  it('calculates cost with different hourly rates', () => {
    // 1 hour at $2/hour = $2
    const cost = calculateSandboxCost(1000 * 60 * 60, 2)
    expect(cost).toBeCloseTo(2, 5)
  })

  it('handles sub-millisecond durations', () => {
    // Very small duration should result in very small cost
    const cost = calculateSandboxCost(1, 1)
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(0.001)
  })
})

describe('CostEntrySchema', () => {
  it('validates correct entry', () => {
    const entry = {
      id: 'cost-1',
      type: 'model' as const,
      runId: 'run-123',
      stepId: 'step-456',
      amount: 0.05,
      currency: 'USD',
      timestamp: Date.now()
    }
    const result = CostEntrySchema.safeParse(entry)
    expect(result.success).toBe(true)
  })

  it('accepts all cost types', () => {
    const types = ['model', 'compute', 'storage'] as const
    types.forEach(type => {
      const entry = {
        id: 'cost-1',
        type,
        runId: 'run-123',
        stepId: 'step-456',
        amount: 0.05,
        timestamp: Date.now()
      }
      expect(CostEntrySchema.safeParse(entry).success).toBe(true)
    })
  })

  it('rejects negative amount', () => {
    const entry = {
      id: 'cost-1',
      type: 'model' as const,
      runId: 'run-123',
      stepId: 'step-456',
      amount: -0.05,
      timestamp: Date.now()
    }
    const result = CostEntrySchema.safeParse(entry)
    expect(result.success).toBe(false)
  })

  it('allows optional currency and metadata', () => {
    const entry = {
      id: 'cost-1',
      type: 'model' as const,
      runId: 'run-123',
      stepId: 'step-456',
      amount: 0.05,
      timestamp: Date.now()
    }
    const result = CostEntrySchema.safeParse(entry)
    expect(result.success).toBe(true)
  })
})

describe('ModelUsageSchema', () => {
  it('validates correct usage', () => {
    const usage = {
      modelName: 'gpt-4',
      inputTokens: 100,
      outputTokens: 50
    }
    const result = ModelUsageSchema.safeParse(usage)
    expect(result.success).toBe(true)
  })

  it('rejects negative tokens', () => {
    const usage = {
      modelName: 'gpt-4',
      inputTokens: -100,
      outputTokens: 50
    }
    const result = ModelUsageSchema.safeParse(usage)
    expect(result.success).toBe(false)
  })

  it('allows zero tokens', () => {
    const usage = {
      modelName: 'gpt-4',
      inputTokens: 0,
      outputTokens: 0
    }
    const result = ModelUsageSchema.safeParse(usage)
    expect(result.success).toBe(true)
  })
})

describe('ExecutionCostSchema', () => {
  it('validates correct aggregate cost', () => {
    const cost = {
      runId: 'run-123',
      entries: [
        {
          id: 'cost-1',
          type: 'model' as const,
          runId: 'run-123',
          stepId: 'step-456',
          amount: 0.05,
          timestamp: Date.now()
        }
      ],
      totalCost: 0.05,
      currency: 'USD',
      startTime: Date.now(),
      endTime: Date.now() + 1000
    }
    const result = ExecutionCostSchema.safeParse(cost)
    expect(result.success).toBe(true)
  })

  it('allows empty entries list', () => {
    const cost = {
      runId: 'run-123',
      entries: [],
      totalCost: 0,
      startTime: Date.now()
    }
    const result = ExecutionCostSchema.safeParse(cost)
    expect(result.success).toBe(true)
  })

  it('rejects negative totalCost', () => {
    const cost = {
      runId: 'run-123',
      entries: [],
      totalCost: -0.05,
      startTime: Date.now()
    }
    const result = ExecutionCostSchema.safeParse(cost)
    expect(result.success).toBe(false)
  })

  it('allows optional endTime', () => {
    const cost = {
      runId: 'run-123',
      entries: [],
      totalCost: 0,
      startTime: Date.now()
    }
    const result = ExecutionCostSchema.safeParse(cost)
    expect(result.success).toBe(true)
  })
})

describe('SandboxCostConfigSchema', () => {
  it('validates docker config', () => {
    const config = {
      type: 'docker' as const,
      costPerHour: 0.50,
      minimumChargeDuration: 60000
    }
    const result = SandboxCostConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('validates cloud config', () => {
    const config = {
      type: 'cloud' as const,
      costPerHour: 2.0
    }
    const result = SandboxCostConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('rejects negative cost', () => {
    const config = {
      type: 'docker' as const,
      costPerHour: -0.50
    }
    const result = SandboxCostConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('allows zero cost', () => {
    const config = {
      type: 'docker' as const,
      costPerHour: 0
    }
    const result = SandboxCostConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })
})
