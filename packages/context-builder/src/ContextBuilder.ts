/**
 * ContextBuilder Service
 *
 * Main integration point for Intent Classification, Repo Awareness,
 * and Token Budgeting. Produces deterministic, bounded LLM context.
 *
 * No side effects. Pure function. Deterministic output.
 * Pipeline: validate → strategy → assemble → compose → calculate → return
 */

import type { ContextBuilderInput, ContextBuilderOutput } from './types.js';
import { ValidationError } from './errors.js';
import { IntentStrategyResolver } from './strategies/IntentStrategyResolver.js';
import { ContextAssembler } from './assembler/ContextAssembler.js';
import { BudgetCalculator } from './budget/BudgetCalculator.js';
import { PromptComposer } from './composer/PromptComposer.js';

/**
 * ContextBuilder orchestrates context assembly
 *
 * Integrates:
 * - Intent classification (determines strategy)
 * - Repo awareness (provides context data)
 * - Token budgeting (enforces hard limits)
 *
 * @example
 * const builder = new ContextBuilder();
 * const context = await builder.build({
 *   userMessage: 'Add tests to foo',
 *   intent: { type: 'implement' },
 *   repoSummary: { ... },
 * });
 */
export class ContextBuilder {
  private readonly strategyResolver: IntentStrategyResolver;
  private readonly assembler: ContextAssembler;
  private readonly budgetCalculator: BudgetCalculator;
  private readonly composer: PromptComposer;

  constructor() {
    this.strategyResolver = new IntentStrategyResolver();
    this.assembler = new ContextAssembler();
    this.budgetCalculator = new BudgetCalculator();
    this.composer = new PromptComposer();
  }

  /**
   * Build deterministic, bounded context for LLM
   *
   * Pipeline:
   * 1. Validate input
   * 2. Resolve intent strategy
   * 3. Assemble context blocks
   * 4. Compose prompt
   * 5. Calculate token budget
   * 6. Return final output
   *
   * @throws ValidationError if input invalid
   * @throws BudgetExceededError if critical buckets can't fit
   */
  async build(input: ContextBuilderInput): Promise<ContextBuilderOutput> {
    // 1. Validate input
    this.validateInput(input);

    console.log(`[context-builder/build] Starting for intent: ${input.intent.primary}`);

    // 2. Resolve strategy based on intent
    const strategy = this.strategyResolver.resolve(input.intent.primary);
    console.log(`[context-builder/build] Resolved strategy: ${strategy.intent}`);

    // 3. Assemble context blocks
    const blocks = await this.assembler.assemble(input, strategy);
    console.log(`[context-builder/build] Assembled ${blocks.length} blocks`);

    // 4. Compose prompt
    const { systemPrompt, userPrompt } = this.composer.compose(blocks, input.userMessage);
    console.log(`[context-builder/build] System prompt: ${systemPrompt.length} chars`);
    console.log(`[context-builder/build] User prompt: ${userPrompt.length} chars`);

    // 5. Calculate token budget
    const { blocks: allocatedBlocks, report } = this.budgetCalculator.calculate(
      blocks,
      systemPrompt,
      input.userMessage,
      input.maxTokens
    );
    console.log(`[context-builder/build] Budget: ${report.totalUsed}/${input.maxTokens || 13500} tokens`);
    console.log(`[context-builder/build] Dropped: ${report.droppedBlocks.length}, Truncated: ${report.truncatedBlocks.length}`);

    // 6. Return final output
    const output: ContextBuilderOutput = {
      systemPrompt,
      userPrompt,
      contextBlocks: allocatedBlocks,
      tokenReport: report,
      metadata: {
        intent: input.intent.primary,
        strategyUsed: strategy.intent,
        timestamp: Date.now(),
      },
    };

    return output;
  }

  /**
   * Validate input constraints (strict)
   */
  private validateInput(input: ContextBuilderInput): void {
    if (!input.userMessage?.trim()) {
      throw new ValidationError('userMessage', 'User message cannot be empty');
    }

    if (!input.intent) {
      throw new ValidationError('intent', 'Intent must be provided');
    }

    if (!input.intent.primary) {
      throw new ValidationError('intent.primary', 'Intent primary must be provided');
    }

    if (!input.repoSummary) {
      throw new ValidationError('repoSummary', 'Repo summary must be provided');
    }
  }
}
