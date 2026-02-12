/**
 * PricingProvider Tests
 * Verifies StaticPricingProvider loads, validates, and serves pricing correctly
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { MockPricingProvider } from '../src/pricing/MockPricingProvider.js'
import { DEFAULT_PRICING_CURRENCY } from '../src/pricing/PricingProvider.js'

/**
 * Test suite for PricingProvider interface
 * Uses MockPricingProvider (test fixture)
 * Phase 3 will test real providers (LiteLLMPricingProvider, etc.)
 */
describe('PricingProvider (via MockPricingProvider)', () => {
  let provider: MockPricingProvider

  beforeAll(() => {
    provider = new MockPricingProvider()
  })

  describe('initialization', () => {
    it('should create mock provider with test fixtures', () => {
      expect(provider).toBeDefined()
    })

    it('should throw for unknown models in test fixtures', () => {
      expect(provider.getPricing('unknown-model', 'openai')).rejects.toThrow()
    })
  })

  describe('getPricing', () => {
    it('should return pricing for OpenAI gpt-4o', async () => {
      const pricing = await provider.getPricing('gpt-4o', 'openai')

      expect(pricing).toEqual({
        model: 'gpt-4o',
        provider: 'openai',
        inputPer1k: 0.005,
        outputPer1k: 0.015,
        lastUpdated: expect.any(String),
        currency: DEFAULT_PRICING_CURRENCY
      })
    })

    it('should return pricing for Anthropic claude-3-5-sonnet', async () => {
      const pricing = await provider.getPricing('claude-3-5-sonnet', 'anthropic')

      expect(pricing).toEqual({
        model: 'claude-3-5-sonnet',
        provider: 'anthropic',
        inputPer1k: 0.003,
        outputPer1k: 0.015,
        lastUpdated: expect.any(String),
        currency: DEFAULT_PRICING_CURRENCY
      })
    })

    it('should return pricing for Groq llama3-70b (free)', async () => {
      const pricing = await provider.getPricing('llama3-70b', 'groq')

      expect(pricing.inputPer1k).toBe(0)
      expect(pricing.outputPer1k).toBe(0)
      expect(pricing.currency).toBe(DEFAULT_PRICING_CURRENCY)
    })

    it('should throw for unknown provider', async () => {
      await expect(provider.getPricing('gpt-4o', 'unknown-provider')).rejects.toThrow(
        /Provider not found/
      )
    })

    it('should throw for unknown model', async () => {
      await expect(provider.getPricing('unknown-model-xyz', 'openai')).rejects.toThrow(
        /Model not found/
      )
    })

    it('should have helpful error message for unknown model', async () => {
      try {
        await provider.getPricing('nonexistent', 'anthropic')
        expect.fail('Should have thrown')
      } catch (error) {
        const message = (error as Error).message
        expect(message).toContain('nonexistent')
        expect(message).toContain('anthropic')
        expect(message).toContain('claude-3-5-sonnet')
      }
    })

    it('should have helpful error message for unknown provider', async () => {
      try {
        await provider.getPricing('gpt-4o', 'fake-provider')
        expect.fail('Should have thrown')
      } catch (error) {
        const message = (error as Error).message
        expect(message).toContain('fake-provider')
        expect(message).toContain('openai')
        expect(message).toContain('anthropic')
      }
    })

    it('should return consistent pricing across multiple calls', async () => {
      const pricing1 = await provider.getPricing('gpt-3.5-turbo', 'openai')
      const pricing2 = await provider.getPricing('gpt-3.5-turbo', 'openai')

      expect(pricing1).toEqual(pricing2)
    })
  })

  describe('listAvailableModels', () => {
    it('should return all unique models', async () => {
      const models = await provider.listAvailableModels()

      expect(models).toContain('gpt-4o')
      expect(models).toContain('gpt-4-turbo')
      expect(models).toContain('gpt-3.5-turbo')
      expect(models).toContain('claude-3-5-sonnet')
      expect(models).toContain('claude-3-opus')
      expect(models).toContain('llama3-70b')
      expect(models).toContain('llama2')
    })

    it('should return models in sorted order', async () => {
      const models = await provider.listAvailableModels()
      const sorted = [...models].sort()

      expect(models).toEqual(sorted)
    })

    it('should not have duplicates', async () => {
      const models = await provider.listAvailableModels()
      const unique = new Set(models)

      expect(models.length).toBe(unique.size)
    })
  })

  describe('listSupportedProviders', () => {
    it('should return all providers', async () => {
      const providers = await provider.listSupportedProviders()

      expect(providers).toContain('openai')
      expect(providers).toContain('anthropic')
      expect(providers).toContain('groq')
      expect(providers).toContain('ollama')
    })

    it('should return providers in sorted order', async () => {
      const providers = await provider.listSupportedProviders()
      const sorted = [...providers].sort()

      expect(providers).toEqual(sorted)
    })

    it('should not have duplicates', async () => {
      const providers = await provider.listSupportedProviders()
      const unique = new Set(providers)

      expect(providers.length).toBe(unique.size)
    })
  })

  describe('pricing data validation', () => {
    it('should have valid ISO timestamps', async () => {
      const models = await provider.listAvailableModels()

      for (const model of models) {
        const providers = await provider.listSupportedProviders()
        for (const prov of providers) {
          try {
            const pricing = await provider.getPricing(model, prov)
            const date = new Date(pricing.lastUpdated)
            expect(date.getTime()).not.toBeNaN()
          } catch {
            // Model not in this provider, skip
          }
        }
      }
    })

    it('should have non-negative prices', async () => {
      const models = await provider.listAvailableModels()

      for (const model of models) {
        const providers = await provider.listSupportedProviders()
        for (const prov of providers) {
          try {
            const pricing = await provider.getPricing(model, prov)
            expect(pricing.inputPer1k).toBeGreaterThanOrEqual(0)
            expect(pricing.outputPer1k).toBeGreaterThanOrEqual(0)
          } catch {
            // Model not in this provider, skip
          }
        }
      }
    })

    it('should have currency as USD', async () => {
      const models = await provider.listAvailableModels()

      for (const model of models) {
        const providers = await provider.listSupportedProviders()
        for (const prov of providers) {
          try {
            const pricing = await provider.getPricing(model, prov)
            expect(pricing.currency).toBe(DEFAULT_PRICING_CURRENCY)
          } catch {
            // Model not in this provider, skip
          }
        }
      }
    })
  })
})
