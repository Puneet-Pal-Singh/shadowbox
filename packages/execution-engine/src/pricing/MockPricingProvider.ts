/**
 * MockPricingProvider - Test/Development Mock
 * 
 * For testing only. Phase 3 will implement real providers:
 * - LiteLLMPricingProvider (dynamic API)
 * - OpenAIDirectPricingProvider (official OpenAI API)
 * - AnthropicDirectPricingProvider (official Anthropic API)
 * 
 * NEVER use in production. Pricing must come from actual LLM API providers.
 */

import type { PricingProvider, ModelPricingData } from './PricingProvider.js'

/**
 * Test fixture: Known models and prices for testing
 * Replace with real API calls in Phase 3
 */
const TEST_PRICING: Record<string, Record<string, ModelPricingData>> = {
  openai: {
    'gpt-4o': {
      model: 'gpt-4o',
      provider: 'openai',
      inputPer1k: 0.005,
      outputPer1k: 0.015,
      lastUpdated: new Date().toISOString(),
      currency: 'USD'
    },
    'gpt-4-turbo': {
      model: 'gpt-4-turbo',
      provider: 'openai',
      inputPer1k: 0.01,
      outputPer1k: 0.03,
      lastUpdated: new Date().toISOString(),
      currency: 'USD'
    },
    'gpt-3.5-turbo': {
      model: 'gpt-3.5-turbo',
      provider: 'openai',
      inputPer1k: 0.0005,
      outputPer1k: 0.0015,
      lastUpdated: new Date().toISOString(),
      currency: 'USD'
    }
  },
  anthropic: {
    'claude-3-5-sonnet': {
      model: 'claude-3-5-sonnet',
      provider: 'anthropic',
      inputPer1k: 0.003,
      outputPer1k: 0.015,
      lastUpdated: new Date().toISOString(),
      currency: 'USD'
    },
    'claude-3-opus': {
      model: 'claude-3-opus',
      provider: 'anthropic',
      inputPer1k: 0.015,
      outputPer1k: 0.075,
      lastUpdated: new Date().toISOString(),
      currency: 'USD'
    }
  },
  groq: {
    'llama3-70b': {
      model: 'llama3-70b',
      provider: 'groq',
      inputPer1k: 0,
      outputPer1k: 0,
      lastUpdated: new Date().toISOString(),
      currency: 'USD'
    }
  },
  ollama: {
    'llama2': {
      model: 'llama2',
      provider: 'ollama',
      inputPer1k: 0,
      outputPer1k: 0,
      lastUpdated: new Date().toISOString(),
      currency: 'USD'
    }
  }
}

/**
 * MockPricingProvider - For testing only
 * @deprecated Use LiteLLMPricingProvider in Phase 3
 */
export class MockPricingProvider implements PricingProvider {
  constructor(private pricing: Record<string, Record<string, ModelPricingData>> = TEST_PRICING) {}

  async getPricing(model: string, provider: string): Promise<ModelPricingData> {
    const providerData = this.pricing[provider]
    if (!providerData) {
      throw new Error(`[mock/pricing] Provider "${provider}" not found in test fixture`)
    }

    const pricing = providerData[model]
    if (!pricing) {
      throw new Error(`[mock/pricing] Model "${model}" not found in test fixture`)
    }

    return pricing
  }

  async listAvailableModels(): Promise<string[]> {
    const models = new Set<string>()
    for (const providerModels of Object.values(this.pricing)) {
      for (const model of Object.keys(providerModels)) {
        models.add(model)
      }
    }
    return Array.from(models).sort()
  }

  async listSupportedProviders(): Promise<string[]> {
    return Object.keys(this.pricing).sort()
  }
}
