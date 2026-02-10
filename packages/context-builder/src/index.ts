/**
 * Context Builder - Public API
 *
 * Deterministic LLM context assembly engine.
 * Consumes intent, repo awareness, and token budgets to produce bounded context.
 */

// Main service
export { ContextBuilder } from './ContextBuilder.js';

// Strategies
export { IntentStrategyResolver, buildStrategyMap, getStrategy, getAvailableIntents } from './strategies/index.js';

// Assembler
export { ContextAssembler } from './assembler/index.js';

// Budget
export { BudgetCalculator, BudgetEnforcer } from './budget/index.js';

// Composer
export { PromptComposer } from './composer/index.js';

// Types
export type {
  ContextBuilderInput,
  ContextBuilderOutput,
  ContextBlock,
  ContextStrategy,
  TokenBudgetReport,
  ChatTurn,
  TokenBucket,
  ContextBlockType,
  BucketType,
} from './types.js';

// Errors
export { ValidationError, ContextError, BudgetExceededError } from './errors.js';
