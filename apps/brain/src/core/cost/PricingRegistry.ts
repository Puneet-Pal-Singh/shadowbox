// apps/brain/src/core/cost/PricingRegistry.ts
// Phase 3.1: Registry pricing with boot-time seed loading

import defaultPricing from "./pricing.default.json";
import type { LLMUsage, CalculatedCost, PricingEntry } from "./types";

export interface PricingRegistryOptions {
  failOnUnseededPricing?: boolean;
  isProduction?: boolean;
  staleThresholdDays?: number;
  failOnStale?: boolean;
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
      staleThresholdDays: options?.staleThresholdDays ?? 90,
      failOnStale: options?.failOnStale ?? false,
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
    const key = `${provider}:${model}`;
    const normalized = this.normalizePricingEntry(key, entry);
    this.validateStaleness(key, normalized);
    this.prices.set(key, normalized);
    console.log(`[cost/pricing] Registered pricing: ${key}`);
  }

  loadFromJSON(pricingData: Record<string, PricingEntry>): void {
    for (const [key, entry] of Object.entries(pricingData)) {
      const normalized = this.normalizePricingEntry(key, entry);
      this.validateStaleness(key, normalized);
      this.prices.set(key, normalized);
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

  private normalizePricingEntry(key: string, entry: PricingEntry): PricingEntry {
    const effectiveDate = entry.effectiveDate ?? entry.lastUpdated;
    if (!effectiveDate) {
      throw new PricingError(
        `Pricing entry ${key} must include effectiveDate or lastUpdated`,
      );
    }

    return {
      ...entry,
      effectiveDate,
      lastUpdated: entry.lastUpdated ?? effectiveDate,
      metadata: entry.metadata ?? {},
    };
  }

  private validateStaleness(key: string, entry: PricingEntry): void {
    const dateString = entry.effectiveDate ?? entry.lastUpdated;
    if (!dateString) {
      return;
    }

    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) {
      throw new PricingError(
        `Pricing entry ${key} has invalid date: ${dateString}`,
      );
    }

    const ageMs = Date.now() - parsed.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    if (ageDays <= this.options.staleThresholdDays) {
      return;
    }

    const source = entry.metadata?.source ?? "unknown";
    const version = entry.metadata?.version ?? "unknown";
    const message =
      `Stale pricing detected for ${key}: ${ageDays} days old ` +
      `(threshold=${this.options.staleThresholdDays}, source=${source}, version=${version})`;

    if (this.options.failOnStale || this.options.isProduction) {
      throw new PricingError(message);
    }
    if (!detectTestEnvironment()) {
      console.warn(`[cost/pricing] ${message}`);
    }
  }
}

function detectProductionEnvironment(): boolean {
  if (typeof process === "undefined") {
    return false;
  }
  return process.env?.NODE_ENV === "production";
}

function detectTestEnvironment(): boolean {
  if (typeof process === "undefined") {
    return false;
  }
  return process.env?.NODE_ENV === "test";
}

export class PricingError extends Error {
  constructor(message: string, cause?: unknown) {
    super(`[cost/pricing] ${message}`, { cause });
    this.name = "PricingError";
  }
}
