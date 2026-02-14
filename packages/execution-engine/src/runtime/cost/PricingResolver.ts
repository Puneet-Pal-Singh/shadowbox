import type { IPricingRegistry } from "./PricingRegistry";
import type { LLMUsage, PricingSource } from "./types";

export interface PricingResolution {
  providerCostUsd?: number;
  calculatedCostUsd: number;
  pricingSource: PricingSource;
  shouldBlock: boolean;
}

export interface PricingResolverOptions {
  unknownPricingMode: "warn" | "block";
}

export interface IPricingResolver {
  resolve(usage: LLMUsage, raw?: unknown): PricingResolution;
}

export class PricingResolver implements IPricingResolver {
  private readonly unknownPricingMode: "warn" | "block";

  constructor(
    private readonly pricingRegistry: IPricingRegistry,
    options?: Partial<PricingResolverOptions>,
  ) {
    this.unknownPricingMode =
      options?.unknownPricingMode ?? getDefaultUnknownPricingMode();
  }

  resolve(usage: LLMUsage, raw?: unknown): PricingResolution {
    if (typeof usage.cost === "number" && usage.cost > 0) {
      console.log("[cost/pricing] source=provider");
      return {
        providerCostUsd: usage.cost,
        calculatedCostUsd: usage.cost,
        pricingSource: "provider",
        shouldBlock: false,
      };
    }

    const litellmCost = this.extractLiteLLMCost(raw ?? usage.raw);
    if (litellmCost !== undefined) {
      console.log("[cost/pricing] source=litellm");
      return {
        providerCostUsd: litellmCost,
        calculatedCostUsd: litellmCost,
        pricingSource: "litellm",
        shouldBlock: false,
      };
    }

    const registryCost = this.pricingRegistry.calculateCost(usage);
    if (registryCost.pricingSource === "registry") {
      console.log("[cost/pricing] source=registry");
      return {
        calculatedCostUsd: registryCost.totalCost,
        pricingSource: "registry",
        shouldBlock: false,
      };
    }

    const shouldBlock = this.unknownPricingMode === "block";
    console.warn(
      `[cost/pricing] source=unknown provider=${usage.provider} model=${usage.model} mode=${this.unknownPricingMode}`,
    );
    return {
      calculatedCostUsd: 0,
      pricingSource: "unknown",
      shouldBlock,
    };
  }

  private extractLiteLLMCost(raw: unknown): number | undefined {
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const candidate = raw as Record<string, unknown>;
    const directKeys = [
      "response_cost",
      "litellm_response_cost",
      "litellm_cost",
      "cost",
      "total_cost",
    ];
    for (const key of directKeys) {
      const value = candidate[key];
      if (typeof value === "number" && value > 0) {
        return value;
      }
    }

    const usageValue = candidate.usage;
    if (usageValue && typeof usageValue === "object") {
      const usageRecord = usageValue as Record<string, unknown>;
      const nestedCost = usageRecord.total_cost ?? usageRecord.cost;
      if (typeof nestedCost === "number" && nestedCost > 0) {
        return nestedCost;
      }
    }

    return undefined;
  }
}

function getDefaultUnknownPricingMode(): "warn" | "block" {
  const nodeEnv =
    typeof process !== "undefined" ? process.env?.NODE_ENV : undefined;
  return nodeEnv === "production" ? "block" : "warn";
}
