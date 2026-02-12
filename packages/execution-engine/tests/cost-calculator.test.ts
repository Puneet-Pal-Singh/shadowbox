/**
 * CostCalculator Tests
 * Tests pricing calculations
 */

import { describe, it, expect } from 'vitest'
import { CostCalculator } from '../src/cost/CostCalculator.js'

describe('CostCalculator', () => {
  describe('calculateTokenCost', () => {
    it('should calculate GPT-4 token cost', () => {
      const cost = CostCalculator.calculateTokenCost('gpt-4', 1000, 1000)
      // GPT-4: input = $0.03/1K, output = $0.06/1K
      // (1000/1000) * 0.03 + (1000/1000) * 0.06 = 0.09
      expect(cost).toBe(0.09)
    })

    it('should calculate GPT-3.5 token cost', () => {
      const cost = CostCalculator.calculateTokenCost('gpt-3.5-turbo', 1000, 1000)
      // GPT-3.5: input = $0.0005/1K, output = $0.0015/1K
      // (1000/1000) * 0.0005 + (1000/1000) * 0.0015 = 0.002
      expect(cost).toBeCloseTo(0.002, 5)
    })

    it('should handle fractional tokens', () => {
      const cost = CostCalculator.calculateTokenCost('gpt-4', 500, 250)
      // (500/1000) * 0.03 + (250/1000) * 0.06 = 0.015 + 0.015 = 0.03
      expect(cost).toBe(0.03)
    })

    it('should throw for unknown model', () => {
      expect(() => CostCalculator.calculateTokenCost('unknown-model', 1000, 1000)).toThrow()
    })
  })

  describe('calculateComputeCost', () => {
    it('should calculate cloud compute cost', () => {
      const cost = CostCalculator.calculateComputeCost('cloud', 1000) // 1 second
      // Cloud: $0.000001/ms
      // 1000ms * 0.000001 = 0.001
      expect(cost).toBeCloseTo(0.001, 6)
    })

    it('should calculate docker compute cost', () => {
      const cost = CostCalculator.calculateComputeCost('docker', 1000)
      // Docker: $0.0000005/ms
      // 1000ms * 0.0000005 = 0.0005
      expect(cost).toBeCloseTo(0.0005, 6)
    })

    it('should calculate local compute cost as zero', () => {
      const cost = CostCalculator.calculateComputeCost('local', 1000)
      expect(cost).toBe(0)
    })

    it('should throw for unknown executor', () => {
      expect(() => CostCalculator.calculateComputeCost('unknown' as any, 1000)).toThrow()
    })
  })

  describe('calculateTotalCost', () => {
    it('should sum token and compute costs', () => {
      const cost = CostCalculator.calculateTotalCost('gpt-4', 'cloud', 1000, 1000, 1000)
      // Token cost: 0.09
      // Compute cost: 0.001
      // Total: 0.091
      expect(cost).toBeCloseTo(0.091, 5)
    })

    it('should calculate cost for different models and executors', () => {
      const cost = CostCalculator.calculateTotalCost('gpt-3.5-turbo', 'docker', 500, 250, 5000)
      // Token cost: (500/1000)*0.0005 + (250/1000)*0.0015 = 0.000625
      // Compute cost: 5000 * 0.0000005 = 0.0025
      // Total: ~0.003125
      expect(cost).toBeGreaterThan(0)
    })

    it('should handle local execution with no compute cost', () => {
      const cost = CostCalculator.calculateTotalCost('gpt-4', 'local', 1000, 1000, 1000)
      // Only token cost, no compute cost for local
      expect(cost).toBe(0.09)
    })
  })

  describe('listAvailableModels', () => {
    it('should return list of available models', () => {
      const models = CostCalculator.listAvailableModels()

      expect(models).toContain('gpt-4')
      expect(models).toContain('gpt-3.5-turbo')
      expect(models).toContain('claude-3-opus')
      expect(models.length).toBeGreaterThan(0)
    })

    it('should not include disabled models', () => {
      const models = CostCalculator.listAvailableModels()
      // All test models should be enabled
      expect(models.length).toBeGreaterThan(0)
    })
  })

  describe('listAvailableExecutors', () => {
    it('should return list of available executors', () => {
      const executors = CostCalculator.listAvailableExecutors()

      expect(executors).toContain('cloud')
      expect(executors).toContain('docker')
      expect(executors).toContain('local')
      expect(executors).toHaveLength(3)
    })
  })

  describe('cost comparisons', () => {
    it('should show cloud is more expensive than docker for compute', () => {
      const cloudCost = CostCalculator.calculateComputeCost('cloud', 1000)
      const dockerCost = CostCalculator.calculateComputeCost('docker', 1000)

      expect(cloudCost).toBeGreaterThan(dockerCost)
    })

    it('should show GPT-4 is more expensive than GPT-3.5', () => {
      const gpt4Cost = CostCalculator.calculateTokenCost('gpt-4', 1000, 1000)
      const gpt35Cost = CostCalculator.calculateTokenCost('gpt-3.5-turbo', 1000, 1000)

      expect(gpt4Cost).toBeGreaterThan(gpt35Cost)
    })

    it('should show local execution is cheapest', () => {
      const cloudCost = CostCalculator.calculateComputeCost('cloud', 10000)
      const dockerCost = CostCalculator.calculateComputeCost('docker', 10000)
      const localCost = CostCalculator.calculateComputeCost('local', 10000)

      expect(cloudCost).toBeGreaterThan(dockerCost)
      expect(dockerCost).toBeGreaterThan(localCost)
      expect(localCost).toBe(0)
    })
  })
})
