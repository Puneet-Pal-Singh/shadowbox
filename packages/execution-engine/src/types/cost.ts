/**
 * Cost Tracking Types
 * Defines cost calculation and tracking schemas
 * SOLID: Single Responsibility — cost definition and validation only
 */

import { z } from 'zod'

/**
 * Model pricing record
 * Maps model name to per-token costs
 */
export const ModelPricingSchema = z.object({
  inputTokenPrice: z.number().nonnegative(),
  outputTokenPrice: z.number().nonnegative()
})

export type ModelPricing = z.infer<typeof ModelPricingSchema>

/**
 * Model pricing table
 * Updated from OpenAI API pricing (as of Phase 2.5)
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4': {
    inputTokenPrice: 0.03 / 1000,
    outputTokenPrice: 0.06 / 1000
  },
  'gpt-4-turbo': {
    inputTokenPrice: 0.01 / 1000,
    outputTokenPrice: 0.03 / 1000
  },
  'gpt-3.5-turbo': {
    inputTokenPrice: 0.0005 / 1000,
    outputTokenPrice: 0.0015 / 1000
  },
  'claude-3-opus': {
    inputTokenPrice: 0.015 / 1000,
    outputTokenPrice: 0.075 / 1000
  },
  'claude-3-sonnet': {
    inputTokenPrice: 0.003 / 1000,
    outputTokenPrice: 0.015 / 1000
  },
  'claude-3-haiku': {
    inputTokenPrice: 0.00025 / 1000,
    outputTokenPrice: 0.00125 / 1000
  }
}

/**
 * Single cost entry (atomic record)
 */
export const CostEntrySchema = z.object({
  id: z.string().min(1),
  type: z.enum(['model', 'compute', 'storage']),
  runId: z.string().min(1),
  stepId: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().default('USD'),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.number().int().positive()
})

export type CostEntry = z.infer<typeof CostEntrySchema>

/**
 * Model usage record
 * Tracks tokens consumed by model calls
 */
export const ModelUsageSchema = z.object({
  modelName: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative()
})

export type ModelUsage = z.infer<typeof ModelUsageSchema>

/**
 * Aggregate execution cost
 */
export const ExecutionCostSchema = z.object({
  runId: z.string().min(1),
  entries: z.array(CostEntrySchema),
  totalCost: z.number().nonnegative(),
  currency: z.string().default('USD'),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive().optional()
})

export type ExecutionCost = z.infer<typeof ExecutionCostSchema>

/**
 * Sandbox cost configuration (executor-specific)
 */
export const SandboxCostConfigSchema = z.object({
  type: z.enum(['docker', 'cloud']),
  costPerHour: z.number().nonnegative(),
  minimumChargeDuration: z.number().int().positive().optional()
})

export type SandboxCostConfig = z.infer<typeof SandboxCostConfigSchema>

/**
 * Helper: Get pricing for model
 * @throws If model not found in pricing table
 */
export function getModelPricing(modelName: string): ModelPricing {
  const pricing = MODEL_PRICING[modelName]
  if (!pricing) {
    throw new Error(`Pricing not found for model: ${modelName}`)
  }
  return pricing
}

/**
 * Helper: Calculate token cost
 * Separate input/output tokens for accurate pricing
 * (Different workloads have different token distributions)
 */
export function calculateTokenCost(
  inputTokens: number,
  outputTokens: number,
  modelName: string
): number {
  const pricing = getModelPricing(modelName)
  return inputTokens * pricing.inputTokenPrice + outputTokens * pricing.outputTokenPrice
}

/**
 * Helper: Calculate sandbox/compute cost
 * Assumes hourly billing
 */
export function calculateSandboxCost(durationMs: number, hourlyRate: number): number {
  const durationHours = durationMs / (1000 * 60 * 60)
  return durationHours * hourlyRate
}
