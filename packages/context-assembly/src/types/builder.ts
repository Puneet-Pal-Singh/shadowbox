import type { ContextBuildInput, AgentDescriptor } from "./input.js";
import type { ContextBundle, ContextMessage } from "./output.js";
import type { ToolDescriptor } from "./tools.js";

/**
 * ContextBuilder interface
 *
 * Single responsibility: Convert raw world state → LLM-ready context
 *
 * Invariants:
 * - No side effects
 * - No network calls
 * - No filesystem access
 * - No memory mutations
 * - Deterministic output per input
 */
export interface ContextBuilder {
  /**
   * Build context bundle from input
   *
   * @param input - Context build input
   * @returns Promise resolving to context bundle
   */
  build(input: ContextBuildInput): Promise<ContextBundle>;
}

/**
 * Context source interface
 * Extracts context messages from a specific source
 */
export interface ContextSource {
  /** Source name */
  name: string;

  /**
   * Extract context messages
   *
   * @param input - Build input
   * @param maxTokens - Maximum tokens this source can use
   * @returns Promise resolving to source result
   */
  extract(input: ContextBuildInput, maxTokens: number): Promise<SourceResult>;
}

/**
 * Source extraction result
 */
export interface SourceResult {
  /** Extracted messages */
  messages: ContextMessage[];

  /** Tokens used */
  tokensUsed: number;

  /** Items included */
  itemsIncluded: number;

  /** Items excluded */
  itemsExcluded: number;

  /** Items summarized */
  itemsSummarized: number;
}

/**
 * Assembly strategy handler interface
 * Implementation of an assembly strategy algorithm
 */
export interface AssemblyStrategyHandler {
  /** Strategy name */
  name: string;

  /**
   * Assemble context using this strategy
   *
   * @param input - Build input
   * @param budget - Token budget tracker
   * @param sources - Available context sources
   * @returns Promise resolving to assembly result
   */
  assemble(
    input: ContextBuildInput,
    budget: TokenBudget,
    sources: Map<string, ContextSource>,
  ): Promise<AssemblyResult>;
}

/**
 * Assembly result
 */
export interface AssemblyResult {
  /** Assembled messages */
  messages: ContextMessage[];

  /** Source results map */
  sourceResults: Map<string, SourceResult>;
}

/**
 * Token budget interface
 */
export interface TokenBudget {
  /** Total budget */
  total: number;

  /** Currently used */
  used: number;

  /** Remaining budget */
  remaining: number;

  /**
   * Attempt to allocate tokens
   * @param amount - Amount to allocate
   * @returns Whether allocation succeeded
   */
  allocate(amount: number): boolean;

  /**
   * Force allocation (exceeds budget if needed)
   * @param amount - Amount to allocate
   */
  forceAllocate(amount: number): void;

  /**
   * Get usage statistics
   */
  getUsage(): TokenUsage;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  used: number;
  total: number;
  percentage: number;
}

/**
 * Tool filter interface
 */
export interface ToolFilter {
  /**
   * Filter available tools
   *
   * @param tools - All available tools
   * @param agent - Agent descriptor
   * @returns Filtered tools
   */
  filter(tools: ToolDescriptor[], agent: AgentDescriptor): ToolDescriptor[];
}
