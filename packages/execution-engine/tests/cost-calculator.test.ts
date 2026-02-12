/**
 * CostCalculator Tests
 * Tests token cost calculations with pluggable pricing provider
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { CostCalculator } from '../src/cost/CostCalculator.js'
import { MockPricingProvider } from '../src/pricing/MockPricingProvider.js'
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
    provider = new MockPricingProvider()
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
    it('should calculate cost correctly', async () => {
      const cost = await calculator.calculateTokenCost('gpt-4o', 'openai', TOKENS_TEST_1K, TOKENS_TEST_1K)
      expect(cost).toBeGreaterThan(0)
    })

    it('should handle zero tokens', async () => {
      const cost = await calculator.calculateTokenCost('gpt-4o', 'openai', TOKENS_TEST_0, TOKENS_TEST_0)
      expect(cost).toBe(0)
    })

    it('should handle free models', async () => {
      const cost = await calculator.calculateTokenCost('llama3-70b', 'groq', TOKENS_TEST_1K, TOKENS_TEST_1K)
      expect(cost).toBe(0)
    })

    it('should throw for unknown model', async () => {
      await expect(
        calculator.calculateTokenCost('unknown-model', 'openai', TOKENS_TEST_1K, TOKENS_TEST_1K)
      ).rejects.toThrow()
    })

    it('should throw for unknown provider', async () => {
      await expect(
        calculator.calculateTokenCost('gpt-4o', 'unknown-provider', TOKENS_TEST_1K, TOKENS_TEST_1K)
      ).rejects.toThrow()
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
})
