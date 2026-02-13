// apps/brain/src/core/cost/types.ts
// Phase 3.1: Operational Cost Layer - Type definitions

/**
 * Standardized LLM usage metadata
 * All provider adapters must return this format
 */
export interface LLMUsage {
  provider: string; // "openai", "anthropic", "litellm", etc.
  model: string; // "gpt-4o", "claude-3-opus", etc.
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number; // Optional: if provider returns calculated cost
  raw?: unknown; // Raw provider response for debugging
}

/**
 * Cost calculation result
 */
export interface CalculatedCost {
  inputCost: number; // Cost for input tokens
  outputCost: number; // Cost for output tokens
  totalCost: number; // Total cost in USD
  currency: string; // Always "USD" for now
  pricingSource: "provider" | "litellm" | "registry"; // Where pricing came from
}

/**
 * CostEvent - Append-only cost record for auditability
 * Never update, only append new events
 */
export interface CostEvent {
  runId: string;
  timestamp: string; // ISO 8601
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number; // Calculated cost in USD
  pricingSource: string; // Where cost calculation came from
}

/**
 * Run cost snapshot - Aggregated view (computed on read)
 */
export interface CostSnapshot {
  runId: string;
  totalCost: number;
  totalTokens: number;
  eventCount: number; // Number of cost events
  byModel: Record<string, ModelCost>;
  byProvider: Record<string, ProviderCost>;
  timestamp: string; // When snapshot was generated
}

export interface ModelCost {
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

export interface ProviderCost {
  provider: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

/**
 * Pricing entry for a specific provider:model combination
 */
export interface PricingEntry {
  inputPrice: number; // Per 1K tokens
  outputPrice: number; // Per 1K tokens
  currency: string;
  effectiveDate: string; // ISO date for versioning
}

/**
 * Budget configuration for cost enforcement
 */
export interface BudgetConfig {
  maxCostPerRun: number; // Maximum cost allowed per run in USD
  maxCostPerSession: number; // Maximum cost allowed per session in USD
  warningThreshold: number; // Percentage at which to warn (e.g., 0.8 for 80%)
}

/**
 * Budget check result
 */
export interface BudgetCheckResult {
  allowed: boolean;
  currentCost: number;
  projectedCost: number;
  remainingBudget: number;
  reason?: string;
}

/**
 * Default budget configuration
 */
export const DEFAULT_BUDGET: BudgetConfig = {
  maxCostPerRun: 5.0, // $5.00 per run
  maxCostPerSession: 20.0, // $20.00 per session
  warningThreshold: 0.8, // Warn at 80%
};
