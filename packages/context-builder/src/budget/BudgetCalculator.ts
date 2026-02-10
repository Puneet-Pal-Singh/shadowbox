/**
 * Budget Calculator
 *
 * Counts tokens and allocates context blocks within budget buckets.
 * Deterministic allocation based on block priority.
 */

import { encodingForModel } from 'js-tiktoken';
import type { ContextBlock, TokenBucket, BucketType, TokenBudgetReport } from '../types.js';
import { BudgetExceededError } from '../errors.js';

const DEFAULT_MAX_TOKENS = 13500;

/**
 * Budget limits per bucket (locked for Phase 1)
 */
const BUCKET_LIMITS: Record<BucketType, number> = {
  SYSTEM: 2000,
  USER: 2000,
  REPO_SUMMARY: 3000,
  CONTEXT_BLOCKS: 4000,
  CHAT_HISTORY: 2000,
  OPTIONAL: 1000,
};



/**
 * Calculates token allocation across buckets
 *
 * @example
 * const calc = new BudgetCalculator();
 * const { blocks, report } = calc.calculate(blocks, systemPrompt, userMessage);
 */
export class BudgetCalculator {
  private readonly tokenizer: ReturnType<typeof encodingForModel>;

  constructor() {
    this.tokenizer = encodingForModel('gpt-3.5-turbo');
  }

  /**
   * Count tokens in text
   */
  countTokens(text: string): number {
    try {
      const tokens = this.tokenizer.encode(text);
      return tokens.length;
    } catch {
      // Fallback to simple estimation
      return Math.ceil(text.split(/\s+/).length * 1.3);
    }
  }

  /**
   * Calculate token allocation across buckets
   */
  calculate(
    blocks: ContextBlock[],
    systemPrompt: string,
    userMessage: string,
    maxTokens: number = DEFAULT_MAX_TOKENS
  ): { blocks: ContextBlock[]; report: TokenBudgetReport } {
    const buckets = this.initializeBuckets();
    const droppedBlocks: string[] = [];
    const truncatedBlocks: string[] = [];

    // 1. Count critical buckets
    const systemTokens = this.countTokens(systemPrompt);
    const userTokens = this.countTokens(userMessage);

    buckets.SYSTEM.current = systemTokens;
    buckets.USER.current = userTokens;

    // 2. Validate non-negotiable buckets
    if (systemTokens > buckets.SYSTEM.limit) {
      throw new BudgetExceededError('SYSTEM', buckets.SYSTEM.limit, systemTokens);
    }
    if (userTokens > buckets.USER.limit) {
      throw new BudgetExceededError('USER', buckets.USER.limit, userTokens);
    }

    // 3. Allocate remaining tokens to blocks
    const availableTokens =
      maxTokens - buckets.SYSTEM.current - buckets.USER.current;
    let remainingTokens = availableTokens;
    const allocatedBlocks: ContextBlock[] = [];

    // Sort blocks by priority (descending)
    const sortedBlocks = [...blocks].sort((a, b) => b.priority - a.priority);

    for (const block of sortedBlocks) {
      const blockTokens = this.countTokens(block.content);
      const bucket = this.getBucketForBlockType(block.type);

      if (remainingTokens <= 0) {
        droppedBlocks.push(block.id);
        continue;
      }

      if (blockTokens <= bucket.limit && bucket.current + blockTokens <= bucket.limit) {
        // Block fits in bucket
        allocatedBlocks.push({
          ...block,
          tokenEstimate: blockTokens,
        });
        bucket.current += blockTokens;
        remainingTokens -= blockTokens;
      } else if (bucket.policy === 'TRUNCATE') {
        // Truncate to fit
        const truncatedContent = this.truncateToTokenLimit(
          block.content,
          Math.min(bucket.limit - bucket.current, remainingTokens)
        );
        const truncatedTokens = this.countTokens(truncatedContent);

        if (truncatedTokens > 0) {
          allocatedBlocks.push({
            ...block,
            content: truncatedContent,
            tokenEstimate: truncatedTokens,
          });
          bucket.current += truncatedTokens;
          remainingTokens -= truncatedTokens;
          truncatedBlocks.push(block.id);
        } else {
          droppedBlocks.push(block.id);
        }
      } else if (bucket.policy === 'DROP') {
        // Skip this block
        droppedBlocks.push(block.id);
      }
    }

    // 4. Build report
    const report: TokenBudgetReport = {
      totalUsed:
        buckets.SYSTEM.current +
        buckets.USER.current +
        buckets.REPO_SUMMARY.current +
        buckets.CONTEXT_BLOCKS.current +
        buckets.CHAT_HISTORY.current +
        buckets.OPTIONAL.current,
      perBucket: {
        SYSTEM: buckets.SYSTEM.current,
        USER: buckets.USER.current,
        REPO_SUMMARY: buckets.REPO_SUMMARY.current,
        CONTEXT_BLOCKS: buckets.CONTEXT_BLOCKS.current,
        CHAT_HISTORY: buckets.CHAT_HISTORY.current,
        OPTIONAL: buckets.OPTIONAL.current,
      },
      droppedBlocks,
      truncatedBlocks,
      warnings: this.buildWarnings(droppedBlocks, truncatedBlocks),
    };

    return { blocks: allocatedBlocks, report };
  }

  /**
   * Initialize buckets
   */
  private initializeBuckets(): Record<BucketType, TokenBucket> {
    return {
      SYSTEM: { name: 'SYSTEM', limit: BUCKET_LIMITS.SYSTEM, policy: 'REJECT', current: 0 },
      USER: { name: 'USER', limit: BUCKET_LIMITS.USER, policy: 'REJECT', current: 0 },
      REPO_SUMMARY: {
        name: 'REPO_SUMMARY',
        limit: BUCKET_LIMITS.REPO_SUMMARY,
        policy: 'DROP',
        current: 0,
      },
      CONTEXT_BLOCKS: {
        name: 'CONTEXT_BLOCKS',
        limit: BUCKET_LIMITS.CONTEXT_BLOCKS,
        policy: 'TRUNCATE',
        current: 0,
      },
      CHAT_HISTORY: {
        name: 'CHAT_HISTORY',
        limit: BUCKET_LIMITS.CHAT_HISTORY,
        policy: 'DROP',
        current: 0,
      },
      OPTIONAL: { name: 'OPTIONAL', limit: BUCKET_LIMITS.OPTIONAL, policy: 'DROP', current: 0 },
    };
  }

  /**
   * Get bucket for block type
   */
  private getBucketForBlockType(
    blockType: string
  ): TokenBucket {
    switch (blockType) {
      case 'REPO_SUMMARY':
        return {
          name: 'REPO_SUMMARY',
          limit: BUCKET_LIMITS.REPO_SUMMARY,
          policy: 'DROP',
          current: 0,
        };
      case 'CHAT':
        return {
          name: 'CHAT_HISTORY',
          limit: BUCKET_LIMITS.CHAT_HISTORY,
          policy: 'DROP',
          current: 0,
        };
      default:
        return {
          name: 'CONTEXT_BLOCKS',
          limit: BUCKET_LIMITS.CONTEXT_BLOCKS,
          policy: 'TRUNCATE',
          current: 0,
        };
    }
  }

  /**
   * Truncate text to token limit
   */
  private truncateToTokenLimit(text: string, limit: number): string {
    const tokens = this.tokenizer.encode(text);
    if (tokens.length <= limit) {
      return text;
    }

    const truncated = tokens.slice(0, limit);
    let result = this.tokenizer.decode(truncated);

    // Ensure it ends with a newline or marker
    if (!result.endsWith('\n')) {
      result += '\n';
    }
    result += '[... TRUNCATED ...]';

    return result;
  }

  /**
   * Build warning messages
   */
  private buildWarnings(droppedBlocks: string[], truncatedBlocks: string[]): string[] {
    const warnings: string[] = [];

    if (droppedBlocks.length > 0) {
      warnings.push(`Dropped ${droppedBlocks.length} context block(s) due to budget limits`);
    }

    if (truncatedBlocks.length > 0) {
      warnings.push(`Truncated ${truncatedBlocks.length} context block(s) to fit budget`);
    }

    return warnings;
  }
}
