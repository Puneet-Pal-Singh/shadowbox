// apps/brain/src/core/cost/PricingRegistry.ts
// Phase 3.1: Registry pricing with boot-time seed loading

import defaultPricing from "./pricing.default.json";
import type { LLMUsage, CalculatedCost, PricingEntry } from "./types";

export interface PricingRegistryOptions {
  failOnUnseededPricing?: boolean;
  isProduction?: boolean;
}

export interface IPricingRegistry {
  getPrice(provider: string, model: string): PricingEntry | null;
  calculateCost(usage: LLMUsage): CalculatedCost;
  registerPrice(provider: string, model: string, entry: PricingEntry): void;
  loadFromJSON(pricingData: Record<string, PricingEntry>): void;
  getAllPrices(): Record<string, PricingEntry>;
}

export class PricingRegistry implements IPricingRegistry {
  private prices = new Map<string, PricingEntry>();
  private readonly options: Required<PricingRegistryOptions>;

  constructor(
    initialPricing?: Record<string, PricingEntry>,
    options?: PricingRegistryOptions,
  ) {
    this.options = {
      failOnUnseededPricing: options?.failOnUnseededPricing ?? false,
      isProduction: options?.isProduction ?? detectProductionEnvironment(),
    };

    if (initialPricing) {
      this.loadFromJSON(initialPricing);
      return;
    }

    this.loadDefaultSeedPricing();
  }

  getPrice(provider: string, model: string): PricingEntry | null {
    return this.prices.get(`${provider}:${model}`) ?? null;
  }

  calculateCost(usage: LLMUsage): CalculatedCost {
    if (usage.cost !== undefined && usage.cost > 0) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: usage.cost,
        currency: "USD",
        pricingSource: "provider",
      };
    }

    const pricing = this.getPrice(usage.provider, usage.model);
    if (!pricing) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: "USD",
        pricingSource: "unknown",
      };
    }

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

  registerPrice(provider: string, model: string, entry: PricingEntry): void {
    this.prices.set(`${provider}:${model}`, entry);
    console.log(`[cost/pricing] Registered pricing: ${provider}:${model}`);
  }

  loadFromJSON(pricingData: Record<string, PricingEntry>): void {
    for (const [key, entry] of Object.entries(pricingData)) {
      this.prices.set(key, entry);
    }
  }

  getAllPrices(): Record<string, PricingEntry> {
    const prices: Record<string, PricingEntry> = {};
    for (const [key, value] of this.prices.entries()) {
      prices[key] = value;
    }
    return prices;
  }

  clear(): void {
    this.prices.clear();
  }

  private loadDefaultSeedPricing(): void {
    try {
      this.loadFromJSON(defaultPricing as Record<string, PricingEntry>);
      console.log(
        `[cost/pricing] Loaded ${Object.keys(defaultPricing).length} seeded prices`,
      );
    } catch (error) {
      const failClosed =
        this.options.failOnUnseededPricing || this.options.isProduction;
      if (failClosed) {
        throw new PricingError("Failed to load pricing.default.json", error);
      }
      console.warn(
        "[cost/pricing] Failed to load seeded pricing. Continuing in non-production mode.",
      );
    }
  }
}

function detectProductionEnvironment(): boolean {
  if (typeof process === "undefined") {
    return false;
  }
  return process.env?.NODE_ENV === "production";
}

export class PricingError extends Error {
  constructor(message: string, cause?: unknown) {
    super(`[cost/pricing] ${message}`, { cause });
    this.name = "PricingError";
  }
}
