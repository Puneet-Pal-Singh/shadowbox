// apps/brain/src/core/cost/PricingRegistry.ts
// Phase 3.1: Three-tier pricing strategy (Provider → LiteLLM → Registry)

import type { LLMUsage, CalculatedCost, PricingEntry } from "./types";

export interface IPricingRegistry {
  getPrice(provider: string, model: string): PricingEntry | null;
  calculateCost(usage: LLMUsage): CalculatedCost;
  registerPrice(provider: string, model: string, entry: PricingEntry): void;
  loadFromJSON(pricingData: Record<string, PricingEntry>): void;
  getAllPrices(): Record<string, PricingEntry>;
}

/**
 * PricingRegistry implements three-tier fallback strategy:
 * 1. If provider returns cost → trust it
 * 2. Else if LiteLLM provides cost → use it
 * 3. Else → compute using internal pricing registry
 *
 * Note: Pricing data should be loaded from external configuration (env vars, config files, or API)
 * to avoid hardcoding and allow dynamic updates without code changes.
 */
export class PricingRegistry implements IPricingRegistry {
  private prices = new Map<string, PricingEntry>();

  /**
   * Create a new PricingRegistry
   * @param initialPricing - Optional initial pricing data loaded from external config
   */
  constructor(initialPricing?: Record<string, PricingEntry>) {
    if (initialPricing) {
      this.loadFromJSON(initialPricing);
    }
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

  /**
   * Get all registered prices as a record
   */
  getAllPrices(): Record<string, PricingEntry> {
    const result: Record<string, PricingEntry> = {};
    for (const [key, entry] of this.prices.entries()) {
      result[key] = entry;
    }
    return result;
  }

  /**
   * Clear all pricing data
   */
  clear(): void {
    this.prices.clear();
  }
}

export class PricingError extends Error {
  constructor(message: string) {
    super(`[cost/pricing] ${message}`);
    this.name = "PricingError";
  }
}
