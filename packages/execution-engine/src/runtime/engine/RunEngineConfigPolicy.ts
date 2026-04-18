import type { RunEngineEnv } from "./RunEngine.js";

export function resolveUnknownPricingMode(
  env: RunEngineEnv,
): "warn" | "block" {
  const configuredMode = env.COST_UNKNOWN_PRICING_MODE as unknown;
  if (typeof configuredMode === "string") {
    const normalized = configuredMode.trim().toLowerCase();
    if (normalized === "warn" || normalized === "block") {
      return normalized;
    }
    console.warn(
      `[run/engine] Invalid COST_UNKNOWN_PRICING_MODE=${configuredMode}. Falling back to NODE_ENV default.`,
    );
  }
  const nodeEnv =
    typeof process !== "undefined" ? process.env?.NODE_ENV : undefined;
  return nodeEnv === "production" ? "block" : "warn";
}

export function resolveBudgetConfig(env: RunEngineEnv): {
  maxCostPerRun?: number;
  maxCostPerSession?: number;
} {
  return {
    maxCostPerRun: parseOptionalNumber(env.MAX_RUN_BUDGET),
    maxCostPerSession: parseOptionalNumber(env.MAX_SESSION_BUDGET),
  };
}

function parseOptionalNumber(value?: string): number | undefined {
  if (!value || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
