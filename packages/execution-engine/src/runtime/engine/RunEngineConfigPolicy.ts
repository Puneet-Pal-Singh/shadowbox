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
    env.NODE_ENV ??
    (typeof process !== "undefined" ? process.env?.NODE_ENV : undefined);
  return nodeEnv === "production" ? "block" : "warn";
}

export function resolveBudgetConfig(env: RunEngineEnv): {
  maxCostPerRun?: number;
  maxCostPerSession?: number;
} {
  return {
    maxCostPerRun: parseOptionalBudget("MAX_RUN_BUDGET", env.MAX_RUN_BUDGET),
    maxCostPerSession: parseOptionalBudget(
      "MAX_SESSION_BUDGET",
      env.MAX_SESSION_BUDGET,
    ),
  };
}

function parseOptionalBudget(
  name: string,
  value?: string,
): number | undefined {
  if (!value || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `[run/engine] Invalid ${name}=${value}. Expected a non-negative number.`,
    );
  }
  return parsed;
}
