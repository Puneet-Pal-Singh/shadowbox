/**
 * Intent Strategy Resolver
 *
 * Maps intent type to context strategy.
 * Pure lookup with no side effects.
 */

import type { ContextStrategy } from '../types.js';
import { buildStrategyMap } from './strategies.data.js';

/**
 * Resolves intent to context strategy
 *
 * @example
 * const resolver = new IntentStrategyResolver();
 * const strategy = resolver.resolve('bugfix');
 */
export class IntentStrategyResolver {
  private readonly strategyMap: Map<string, ContextStrategy>;

  constructor() {
    this.strategyMap = buildStrategyMap();
  }

  /**
   * Resolve intent to strategy
   *
   * @throws Error if intent not found
   */
  resolve(intent: string): ContextStrategy {
    const strategy = this.strategyMap.get(intent);
    if (!strategy) {
      throw new Error(
        `Unknown intent: "${intent}". Available intents: ${Array.from(this.strategyMap.keys()).join(', ')}`
      );
    }
    return strategy;
  }

  /**
   * Check if intent is known
   */
  has(intent: string): boolean {
    return this.strategyMap.has(intent);
  }

  /**
   * Get all available intents
   */
  getAvailableIntents(): string[] {
    return Array.from(this.strategyMap.keys());
  }
}
