/**
 * CostCalculator Tests
 * Tests token cost calculations with pluggable pricing provider
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { CostCalculator } from '../src/cost/CostCalculator.js'
import { StaticPricingProvider } from '../src/pricing/StaticPricingProvider.js'
import type { PricingProvider } from '../src/pricing/PricingProvider.js'

/**
 * Test constants
 * Keep token values in sync with CostCalculator.TOKENS_PER_1K
 */
const TOKENS_TEST_1K = 1000 // 1000 tokens for testing
const TOKENS_TEST_500 = 500 // 500 tokens for testing
const TOKENS_TEST_250 = 250 // 250 tokens for testing
const TOKENS_TEST_0 = 0 // 0 tokens for testing
const TOKENS_TEST_10K = 10000 // 10,000 tokens for testing

describe('CostCalculator', () => {
  let calculator: CostCalculator
  let provider: PricingProvider

  beforeAll(() => {
    provider = new StaticPricingProvider()
    calculator = new CostCalculator(provider)
  })

  describe('constructor', () => {
    it('should require a PricingProvider', () => {
      expect(() => new CostCalculator(null as any)).toThrow(/PricingProvider required/)
    })

    it('should accept valid PricingProvider', () => {
      const calc = new CostCalculator(provider)
      expect(calc).toBeDefined()
    })
  })

  describe('calculateTokenCost', () => {
    it('should calculate GPT-4o token cost', async () => {
      // gpt-4o: input = $0.005/1K, output = $0.015/1K
      // (1000/1000) * 0.005 + (1000/1000) * 0.015 = 0.02
      const cost = await calculator.calculateTokenCost('gpt-4o', 'openai', TOKENS_TEST_1K, TOKENS_TEST_1K)
      expect(cost).toBe(0.02)
    })

    it('should calculate GPT-3.5-turbo token cost', async () => {
      // gpt-3.5-turbo: input = $0.0005/1K, output = $0.0015/1K
      // (1000/1000) * 0.0005 + (1000/1000) * 0.0015 = 0.002
      const cost = await calculator.calculateTokenCost('gpt-3.5-turbo', 'openai', TOKENS_TEST_1K, TOKENS_TEST_1K)
      expect(cost).toBeCloseTo(0.002, 5)
    })

    it('should calculate Claude token cost', async () => {
      // claude-3-5-sonnet: input = $0.003/1K, output = $0.015/1K
      // (1000/1000) * 0.003 + (1000/1000) * 0.015 = 0.018
      const cost = await calculator.calculateTokenCost(
        'claude-3-5-sonnet',
        'anthropic',
        TOKENS_TEST_1K,
        TOKENS_TEST_1K
      )
      expect(cost).toBe(0.018)
    })

    it('should handle fractional tokens', async () => {
      // gpt-4o: (500/1000) * 0.005 + (250/1000) * 0.015
      // = 0.0025 + 0.00375 = 0.00625
      const cost = await calculator.calculateTokenCost('gpt-4o', 'openai', TOKENS_TEST_500, TOKENS_TEST_250)
      expect(cost).toBeCloseTo(0.00625, 5)
    })

    it('should handle zero output tokens', async () => {
      // Only input tokens
      const cost = await calculator.calculateTokenCost('gpt-4o', 'openai', TOKENS_TEST_1K, TOKENS_TEST_0)
      expect(cost).toBe(0.005)
    })

    it('should handle free models', async () => {
      // Groq llama3-70b is free
      const cost = await calculator.calculateTokenCost('llama3-70b', 'groq', TOKENS_TEST_1K, TOKENS_TEST_1K)
      expect(cost).toBe(0)
    })

    it('should throw for unknown model', async () => {
      await expect(
        calculator.calculateTokenCost('unknown-model-xyz', 'openai', TOKENS_TEST_1K, TOKENS_TEST_1K)
      ).rejects.toThrow(/Model not found/)
    })

    it('should throw for unknown provider', async () => {
      await expect(
        calculator.calculateTokenCost('gpt-4o', 'unknown-provider', TOKENS_TEST_1K, TOKENS_TEST_1K)
      ).rejects.toThrow(/Provider not found/)
    })
  })

  describe('listAvailableModels', () => {
    it('should return list of available models', async () => {
      const models = await calculator.listAvailableModels()

      expect(models).toContain('gpt-4o')
      expect(models).toContain('gpt-3.5-turbo')
      expect(models).toContain('claude-3-5-sonnet')
      expect(models.length).toBeGreaterThan(0)
    })

    it('should return sorted models', async () => {
      const models = await calculator.listAvailableModels()
      const sorted = [...models].sort()

      expect(models).toEqual(sorted)
    })
  })

  describe('listSupportedProviders', () => {
    it('should return list of supported providers', async () => {
      const providers = await calculator.listSupportedProviders()

      expect(providers).toContain('openai')
      expect(providers).toContain('anthropic')
      expect(providers).toContain('groq')
      expect(providers).toContain('ollama')
    })

    it('should return sorted providers', async () => {
      const providers = await calculator.listSupportedProviders()
      const sorted = [...providers].sort()

      expect(providers).toEqual(sorted)
    })
  })

  describe('cost comparisons', () => {
    it('should show GPT-4o is more expensive than GPT-3.5-turbo', async () => {
      const gpt4Cost = await calculator.calculateTokenCost('gpt-4o', 'openai', TOKENS_TEST_1K, TOKENS_TEST_1K)
      const gpt35Cost = await calculator.calculateTokenCost(
        'gpt-3.5-turbo',
        'openai',
        TOKENS_TEST_1K,
        TOKENS_TEST_1K
      )

      expect(gpt4Cost).toBeGreaterThan(gpt35Cost)
    })

    it('should show Claude Opus is more expensive than Claude Sonnet', async () => {
      const opusCost = await calculator.calculateTokenCost('claude-3-opus', 'anthropic', TOKENS_TEST_1K, TOKENS_TEST_1K)
      const sonnetCost = await calculator.calculateTokenCost(
        'claude-3-5-sonnet',
        'anthropic',
        TOKENS_TEST_1K,
        TOKENS_TEST_1K
      )

      expect(opusCost).toBeGreaterThan(sonnetCost)
    })

    it('should show free models cost $0', async () => {
      const groqCost = await calculator.calculateTokenCost('llama3-70b', 'groq', TOKENS_TEST_10K, TOKENS_TEST_10K)
      const llamaCost = await calculator.calculateTokenCost('llama2', 'ollama', TOKENS_TEST_10K, TOKENS_TEST_10K)

      expect(groqCost).toBe(0)
      expect(llamaCost).toBe(0)
    })

    it('should show output tokens cost more for most models', async () => {
      // gpt-4o output ($0.015) is 3x more expensive than input ($0.005)
      const inputOnlyCost = await calculator.calculateTokenCost('gpt-4o', 'openai', TOKENS_TEST_1K, TOKENS_TEST_0)
      const outputOnlyCost = await calculator.calculateTokenCost('gpt-4o', 'openai', TOKENS_TEST_0, TOKENS_TEST_1K)

      expect(outputOnlyCost).toBeGreaterThan(inputOnlyCost)
    })
  })
})
