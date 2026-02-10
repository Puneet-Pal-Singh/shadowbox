/**
 * Context Builder - Public API
 *
 * Deterministic LLM context assembly engine.
 * Consumes intent, repo awareness, and token budgets to produce bounded context.
 */

export { ContextBuilder } from './ContextBuilder.js';

export type {
  ContextBuilderInput,
  ContextBuilderOutput,
  ContextBlock,
  ContextStrategy,
  TokenBudgetReport,
  ChatTurn,
  TokenBucket,
} from './types.js';

export { ValidationError, ContextError, BudgetExceededError } from './errors.js';
