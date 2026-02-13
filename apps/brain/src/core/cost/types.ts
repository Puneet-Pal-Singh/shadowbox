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
