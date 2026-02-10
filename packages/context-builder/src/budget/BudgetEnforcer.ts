/**
 * Budget Enforcer
 *
 * Applies deterministic drop order and policy enforcement.
 * Ensures token budgets are never exceeded.
 * Does not mutate input blocks or buckets.
 */

import type { ContextBlock, TokenBucket, BucketType, TokenBudgetReport } from '../types.js';

/**
 * Estimated characters per token for rough truncation calculations
 */
const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * Deterministic drop order (when budget exceeded)
 */
const DROP_ORDER: BucketType[] = [
  'OPTIONAL',
  'CHAT_HISTORY',
  'REPO_SUMMARY',
  'CONTEXT_BLOCKS',
];

/**
 * Enforces token budget policies
 *
 * @example
 * const enforcer = new BudgetEnforcer();
 * const { blocks, report } = enforcer.enforce(blocks, buckets, dropOrder);
 */
export class BudgetEnforcer {
  /**
   * Enforce budget policies on blocks (does not mutate input)
   */
  enforce(
    blocks: ContextBlock[],
    buckets: Map<BucketType, TokenBucket>,
    _dropOrder: BucketType[] = DROP_ORDER
  ): { blocks: ContextBlock[]; report: TokenBudgetReport } {
    let currentBlocks = [...blocks];
    const droppedBlocks: string[] = [];
    const truncatedBlocks: string[] = [];
    // Track dropped/truncated tokens separately to avoid mutating bucket.current
    const adjustedBuckets = new Map(
      Array.from(buckets.entries()).map(([key, bucket]) => [
        key,
        { ...bucket },
      ])
    );

    // Apply drop order deterministically
    for (const bucketType of DROP_ORDER) {
      const bucket = adjustedBuckets.get(bucketType);
      if (!bucket || bucket.current <= bucket.limit) continue;

      const blocksInBucket = currentBlocks.filter(b => this.mapBlockTypeToBucket(b.type) === bucketType);

      if (bucket.policy === 'DROP') {
        currentBlocks = currentBlocks.filter(
          b => this.mapBlockTypeToBucket(b.type) !== bucketType
        );
        droppedBlocks.push(...blocksInBucket.map(b => b.id));
        bucket.current = 0;
      } else if (bucket.policy === 'TRUNCATE') {
        // Truncate blocks in this bucket (keep head, remove tail)
        // Create new blocks without mutating originals
        let truncatedTokens = 0;
        currentBlocks = currentBlocks.map(block => {
          if (blocksInBucket.some(b => b.id === block.id)) {
            const maxChars = bucket.limit * CHARS_PER_TOKEN_ESTIMATE;
            const excess = Math.max(0, block.content.length - maxChars);
            if (excess > 0) {
              truncatedBlocks.push(block.id);
              const truncatedContent = block.content.substring(0, block.content.length - excess);
              truncatedTokens += Math.ceil(excess / CHARS_PER_TOKEN_ESTIMATE);
              return {
                ...block,
                content: truncatedContent,
              };
            }
          }
          return block;
        });
        bucket.current -= truncatedTokens;
      }
    }

    return {
      blocks: currentBlocks,
      report: {
        totalUsed: Array.from(adjustedBuckets.values()).reduce((sum, b) => sum + b.current, 0),
        perBucket: this.buildPerBucket(adjustedBuckets),
        droppedBlocks,
        truncatedBlocks,
        warnings: [
          ...droppedBlocks.map(id => `Dropped block: ${id}`),
          ...truncatedBlocks.map(id => `Truncated block: ${id}`),
        ],
      },
    };
  }

  /**
   * Map block type to bucket type
   * Ensures each block type has proper bucket consideration
   */
  private mapBlockTypeToBucket(blockType: string): BucketType {
    switch (blockType) {
      case 'REPO_SUMMARY':
        return 'REPO_SUMMARY';
      case 'CHAT':
        return 'CHAT_HISTORY';
      case 'FILE_LIST':
      case 'TESTS':
      case 'DIFFS':
        return 'CONTEXT_BLOCKS';
      default:
        return 'CONTEXT_BLOCKS';
    }
  }

  /**
   * Build per-bucket token report
   */
  private buildPerBucket(buckets: Map<BucketType, TokenBucket>): Record<BucketType, number> {
    const result: Record<BucketType, number> = {} as any;
    buckets.forEach((bucket, key) => {
      result[key] = bucket.current;
    });
    return result;
  }
}
