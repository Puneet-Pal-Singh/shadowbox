/**
 * BucketRegistry - Budget bucket configuration and ordering
 *
 * Single responsibility: Define buckets, their priorities, and policies
 * No logic beyond configuration and lookup
 */
import type { BucketBudget, BucketKind } from "../types.js";
import { BucketKind as BucketKindEnum, TruncationPolicy } from "../types.js";

/**
 * Default bucket configuration (recommended)
 */
const DEFAULT_BUCKETS: BucketBudget[] = [
  {
    kind: BucketKindEnum.SYSTEM,
    maxTokens: 2000,
    policy: TruncationPolicy.REJECT,
    priority: 0,
  },
  {
    kind: BucketKindEnum.USER,
    maxTokens: 2000,
    policy: TruncationPolicy.REJECT,
    priority: 1,
  },
  {
    kind: BucketKindEnum.REPO_SUMMARY,
    maxTokens: 3000,
    policy: TruncationPolicy.DROP,
    priority: 2,
  },
  {
    kind: BucketKindEnum.TOOLS,
    maxTokens: 4000,
    policy: TruncationPolicy.TRUNCATE,
    priority: 3,
  },
  {
    kind: BucketKindEnum.AGENT_CONTEXT,
    maxTokens: 2000,
    policy: TruncationPolicy.DROP,
    priority: 4,
  },
  {
    kind: BucketKindEnum.OPTIONAL,
    maxTokens: 1000,
    policy: TruncationPolicy.DROP,
    priority: 5,
  },
];

/**
 * Bucket registry: manage bucket configurations
 */
export class BucketRegistry {
  private buckets: Map<BucketKind, BucketBudget>;

  /**
   * Create registry with default or custom buckets
   */
  constructor(
    overrides?: Partial<Record<BucketKind, Partial<BucketBudget>>>,
  ) {
    this.buckets = new Map();

    // Start with defaults
    for (const bucket of DEFAULT_BUCKETS) {
      this.buckets.set(bucket.kind, { ...bucket });
    }

    // Apply overrides
    if (overrides) {
      for (const [kind, override] of Object.entries(overrides)) {
        const existing = this.buckets.get(kind as BucketKind);
        if (existing && override) {
          this.buckets.set(kind as BucketKind, {
            ...existing,
            ...override,
          });
        }
      }
    }
  }

  /**
   * Get bucket by kind
   */
  getBucket(kind: BucketKind): BucketBudget {
    const bucket = this.buckets.get(kind);
    if (!bucket) {
      throw new Error(`Unknown bucket kind: ${kind}`);
    }
    return bucket;
  }

  /**
   * Get all buckets
   */
  getBuckets(): BucketBudget[] {
    return Array.from(this.buckets.values());
  }

  /**
   * Get buckets ordered by priority (highest first)
   */
  getBucketsByPriority(): BucketBudget[] {
    return this.getBuckets().sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get static default buckets
   */
  static getDefaultBuckets(): BucketBudget[] {
    return DEFAULT_BUCKETS.map((b) => ({ ...b }));
  }

  /**
   * Create registry with default buckets
   */
  static createDefault(): BucketRegistry {
    return new BucketRegistry();
  }
}
