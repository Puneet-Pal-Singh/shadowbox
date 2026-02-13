// apps/brain/src/core/cost/PricingRegistry.ts
// Phase 3.1: Three-tier pricing strategy (Provider → LiteLLM → Registry)

import type { LLMUsage, CalculatedCost, PricingEntry } from "./types";

export interface IPricingRegistry {
  getPrice(provider: string, model: string): PricingEntry | null;
  calculateCost(usage: LLMUsage): CalculatedCost;
  registerPrice(provider: string, model: string, entry: PricingEntry): void;
  loadFromJSON(pricingData: Record<string, PricingEntry>): void;
}

/**
 * PricingRegistry implements three-tier fallback strategy:
 * 1. If provider returns cost → trust it
 * 2. Else if LiteLLM provides cost → use it
 * 3. Else → compute using internal pricing registry
 */
export class PricingRegistry implements IPricingRegistry {
  private prices = new Map<string, PricingEntry>();

  // Built-in pricing data (versioned)
  private static readonly DEFAULT_PRICING: Record<string, PricingEntry> = {
    "openai:gpt-4o": {
      inputPrice: 0.005,
      outputPrice: 0.015,
      currency: "USD",
      effectiveDate: "2024-01-01",
    },
    "openai:gpt-4o-mini": {
      inputPrice: 0.00015,
      outputPrice: 0.0006,
      currency: "USD",
      effectiveDate: "2024-01-01",
    },
    "openai:gpt-4-turbo": {
      inputPrice: 0.01,
      outputPrice: 0.03,
      currency: "USD",
      effectiveDate: "2024-01-01",
    },
    "openai:gpt-3.5-turbo": {
      inputPrice: 0.0005,
      outputPrice: 0.0015,
      currency: "USD",
      effectiveDate: "2024-01-01",
    },
    "anthropic:claude-3-opus": {
      inputPrice: 0.015,
      outputPrice: 0.075,
      currency: "USD",
      effectiveDate: "2024-01-01",
    },
    "anthropic:claude-3-sonnet": {
      inputPrice: 0.003,
      outputPrice: 0.015,
      currency: "USD",
      effectiveDate: "2024-01-01",
    },
    "anthropic:claude-3-haiku": {
      inputPrice: 0.00025,
      outputPrice: 0.00125,
      currency: "USD",
      effectiveDate: "2024-01-01",
    },
  };

  constructor() {
    // Load default pricing on instantiation
    this.loadFromJSON(PricingRegistry.DEFAULT_PRICING);
  }

  /**
   * Get pricing for a specific provider:model combination
   */
  getPrice(provider: string, model: string): PricingEntry | null {
    const key = `${provider}:${model}`;
    return this.prices.get(key) ?? null;
  }

  /**
   * Calculate cost using three-tier fallback:
   * 1. Provider cost (if available)
   * 2. LiteLLM cost (if available)
   * 3. Registry lookup
   */
  calculateCost(usage: LLMUsage): CalculatedCost {
    // Tier 1: If provider returned cost, trust it
    if (usage.cost !== undefined && usage.cost > 0) {
      return {
        inputCost: 0, // Provider didn't break it down
        outputCost: 0,
        totalCost: usage.cost,
        currency: "USD",
        pricingSource: "provider",
      };
    }

    // Tier 2: Look up in registry
    const pricing = this.getPrice(usage.provider, usage.model);
    if (pricing) {
      const inputCost = (usage.promptTokens / 1000) * pricing.inputPrice;
      const outputCost = (usage.completionTokens / 1000) * pricing.outputPrice;

      return {
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
        currency: pricing.currency,
        pricingSource: "registry",
      };
    }

    // Tier 3: Unknown pricing - return zero cost with warning
    console.warn(
      `[cost/pricing] Unknown pricing for ${usage.provider}:${usage.model}. ` +
        `Cost tracking disabled for this call.`,
    );

    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: "USD",
      pricingSource: "registry",
    };
  }

  /**
   * Register custom pricing for a provider:model
   */
  registerPrice(provider: string, model: string, entry: PricingEntry): void {
    const key = `${provider}:${model}`;
    this.prices.set(key, entry);
    console.log(`[cost/pricing] Registered pricing: ${key}`);
  }

  /**
   * Load pricing data from JSON object
   */
  loadFromJSON(pricingData: Record<string, PricingEntry>): void {
    for (const [key, entry] of Object.entries(pricingData)) {
      this.prices.set(key, entry);
    }
  }
}

export class PricingError extends Error {
  constructor(message: string) {
    super(`[cost/pricing] ${message}`);
    this.name = "PricingError";
  }
}
