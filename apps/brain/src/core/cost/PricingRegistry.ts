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
 * PricingRegistry implements cost calculation for LLM usage.
 *
 * Current implementation (two-tier fallback):
 * 1. If provider returns cost (usage.cost) → trust it
 * 2. Else → lookup in registry via getPrice()
 * 3. If not found → return zero cost with warning
 *
 * Note: A future implementation may add LiteLLM as an intermediate tier
 * (Tier 2) when LiteLLM provides cost data via response metadata.
 * TODO: Add LiteLLM tier when LiteLLM SDK supports cost extraction.
 * Placeholder for where LiteLLM cost lookup would be implemented:
 * - Check if usage.raw contains LiteLLM cost data
 * - If present, parse and return that cost
 * - Then fall through to registry lookup
 *
 * @see PricingRegistry.calculateCost() for the actual implementation
 * @see IPricingRegistry interface for the contract
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
   * Calculate cost using tiered fallback:
   *
   * Tier 1 (Provider): If usage.cost is provided by the provider, trust it
   * - Provider returns pre-calculated cost in usage.cost
   *
   * Tier 2 (LiteLLM): Not yet implemented
   * - TODO: Check usage.raw for LiteLLM cost metadata
   * - Would parse LiteLLM response for cost data
   *
   * Tier 3 (Registry): Fallback to internal pricing lookup
   * - Uses getPrice() to lookup provider:model pricing
   * - Calculates cost using inputPrice/outputPrice per 1K tokens
   *
   * Tier 4 (Unknown): No pricing available
   * - Returns zero cost with pricingSource: "unknown"
   * - Logs warning for visibility
   *
   * @param usage - LLMUsage with token counts and optional provider cost
   * @returns CalculatedCost with breakdown and source indicator
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

    // Tier 2 (placeholder for LiteLLM):
    // TODO: Check usage.raw for LiteLLM cost data
    // if (usage.raw?.litellm_cost) { ... }

    // Tier 3: Look up in registry
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

    // Tier 4: Unknown pricing - return zero cost with "unknown" source
    console.warn(
      `[cost/pricing] Unknown pricing for ${usage.provider}:${usage.model}. ` +
        `Cost tracking disabled for this call.`,
    );

    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: "USD",
      pricingSource: "unknown",
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
