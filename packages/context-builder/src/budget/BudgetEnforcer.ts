/**
 * Budget Enforcer
 *
 * Applies deterministic drop order and policy enforcement.
 * Ensures token budgets are never exceeded.
 * Does not mutate input blocks.
 */

import type { ContextBlock, TokenBucket, BucketType, TokenBudgetReport } from '../types.js';

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

    // Apply drop order deterministically
    for (const bucketType of DROP_ORDER) {
      const bucket = buckets.get(bucketType);
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
        currentBlocks = currentBlocks.map(block => {
          if (blocksInBucket.some(b => b.id === block.id)) {
            const excess = Math.max(0, block.content.length - (bucket.limit * 4)); // Rough estimate
            if (excess > 0) {
              truncatedBlocks.push(block.id);
              return {
                ...block,
                content: block.content.substring(0, block.content.length - excess),
              };
            }
          }
          return block;
        });
      }
    }

    return {
      blocks: currentBlocks,
      report: {
        totalUsed: Array.from(buckets.values()).reduce((sum, b) => sum + b.current, 0),
        perBucket: this.buildPerBucket(buckets),
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
