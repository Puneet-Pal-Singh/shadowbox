/**
 * BYOK Rate Limiter
 *
 * Per-user-workspace-operation rate limiting to prevent abuse.
 * Limits:
 * - Connect: 10/min
 * - Validate live: 30/min
 * - Resolve: 300/min
 * - Global: 2000 operations/min
 *
 * Usage:
 *   const limiter = new ByokRateLimiter();
 *   const allowed = await limiter.checkLimit('connect', userId, workspaceId);
 *   if (!allowed) {
 *     return { error: 'Rate limit exceeded' };
 *   }
 */

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  operation: "connect" | "validate" | "resolve";
  tokensPerMinute: number;
  burstSize?: number;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  connect: {
    operation: "connect",
    tokensPerMinute: 10,
    burstSize: 15,
  },
  validate: {
    operation: "validate",
    tokensPerMinute: 30,
    burstSize: 45,
  },
  resolve: {
    operation: "resolve",
    tokensPerMinute: 300,
    burstSize: 450,
  },
};

/**
 * Token bucket for a single user/workspace/operation
 */
interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
  refillRatePerMs: number;
}

/**
 * ByokRateLimiter - Token bucket rate limiting
 */
export class ByokRateLimiter {
  private static readonly GLOBAL_BURST_SIZE = 2000;
  private static readonly MAX_BUCKETS = 10_000;
  private static readonly BUCKET_TTL_MS = 2 * 60 * 1000;

  private buckets: Map<string, TokenBucket> = new Map();
  private limits: Map<string, RateLimitConfig> = new Map();
  private globalBucket: TokenBucket = {
    tokens: ByokRateLimiter.GLOBAL_BURST_SIZE,
    lastRefillAt: Date.now(),
    refillRatePerMs: ByokRateLimiter.GLOBAL_BURST_SIZE / 60000,
  };

  constructor() {
    // Initialize limits
    for (const [key, config] of Object.entries(DEFAULT_LIMITS)) {
      this.limits.set(key, config);
    }
  }

  /**
   * Check if operation is within rate limit
   */
  async checkLimit(
    operation: "connect" | "validate" | "resolve",
    userId: string,
    workspaceId: string,
    providerId?: string,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs?: number }> {
    const config = this.limits.get(operation);
    if (!config) {
      return { allowed: false, remaining: 0 };
    }

    // Generate bucket key
    const key = this.getBucketKey(operation, userId, workspaceId, providerId);

    // Check global limit first
    if (!this.tryConsumeGlobal()) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: this.getRetryAfterMs(this.globalBucket),
      };
    }

    // Check operation-specific limit
    const bucket = this.getOrCreateBucket(
      key,
      config.tokensPerMinute,
      config.burstSize ?? config.tokensPerMinute * 1.5,
    );

    const canConsume = this.tryConsume(bucket, 1);

    if (!canConsume) {
      // Restore global token since we didn't use operation-level token
      this.globalBucket.tokens = Math.min(
        this.globalBucket.tokens + 1,
        ByokRateLimiter.GLOBAL_BURST_SIZE,
      );

      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: this.getRetryAfterMs(bucket),
      };
    }

    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
    };
  }

  /**
   * Get remaining tokens for a specific user/workspace/operation
   */
  getRemainingTokens(
    operation: "connect" | "validate" | "resolve",
    userId: string,
    workspaceId: string,
    providerId?: string,
  ): number {
    const key = this.getBucketKey(operation, userId, workspaceId, providerId);
    const bucket = this.buckets.get(key);

    if (!bucket) {
      const config = this.limits.get(operation);
      return config?.tokensPerMinute ?? 0;
    }

    this.refillTokens(bucket);
    const config = this.limits.get(operation);
    const burstSize = config?.burstSize ?? config?.tokensPerMinute ?? Infinity;
    bucket.tokens = Math.min(bucket.tokens, burstSize);
    return Math.floor(bucket.tokens);
  }

  /**
   * Reset a user's rate limits (admin operation)
   */
  resetUserLimits(userId: string, workspaceId: string): void {
    const prefix = `${userId}:${workspaceId}:`;

    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) {
        this.buckets.delete(key);
      }
    }

    console.log(
      `[ByokRateLimiter] Reset limits for user=${userId} workspace=${workspaceId}`,
    );
  }

  /**
   * Get statistics for monitoring
   */
  getStatistics(): {
    activeBuckets: number;
    globalTokensRemaining: number;
    limitConfigs: Record<string, RateLimitConfig>;
  } {
    this.refillTokens(this.globalBucket);
    this.globalBucket.tokens = Math.min(
      this.globalBucket.tokens,
      ByokRateLimiter.GLOBAL_BURST_SIZE,
    );

    return {
      activeBuckets: this.buckets.size,
      globalTokensRemaining: Math.floor(this.globalBucket.tokens),
      limitConfigs: Object.fromEntries(this.limits),
    };
  }

  /**
   * Set custom limit for an operation
   */
  setLimit(
    operation: "connect" | "validate" | "resolve",
    tokensPerMinute: number,
    burstSize?: number,
  ): void {
    this.limits.set(operation, {
      operation,
      tokensPerMinute,
      burstSize: burstSize ?? tokensPerMinute * 1.5,
    });

    console.log(
      `[ByokRateLimiter] Updated limit: ${operation} = ${tokensPerMinute}/min`,
    );
  }

  // ============ Private Methods ============

  /**
   * Generate bucket key for user/workspace/operation
   */
  private getBucketKey(
    operation: string,
    userId: string,
    workspaceId: string,
    providerId?: string,
  ): string {
    return `${userId}:${workspaceId}:${operation}${providerId ? `:${providerId}` : ""}`;
  }

  /**
   * Get or create bucket
   */
  private getOrCreateBucket(
    key: string,
    tokensPerMinute: number,
    burstSize: number,
  ): TokenBucket {
    this.evictStaleBucketsIfNeeded();

    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: burstSize,
        lastRefillAt: Date.now(),
        refillRatePerMs: tokensPerMinute / 60000,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    this.refillTokens(bucket);

    // Cap tokens at burst size
    bucket.tokens = Math.min(bucket.tokens, burstSize);

    return bucket;
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refillTokens(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefillAt;
    const tokensToAdd = elapsed * bucket.refillRatePerMs;

    bucket.tokens += tokensToAdd;
    bucket.lastRefillAt = now;
  }

  /**
   * Try to consume tokens from bucket
   */
  private tryConsume(bucket: TokenBucket, amount: number): boolean {
    this.refillTokens(bucket);

    if (bucket.tokens >= amount) {
      bucket.tokens -= amount;
      return true;
    }

    return false;
  }

  /**
   * Try to consume from global bucket
   */
  private tryConsumeGlobal(): boolean {
    this.refillTokens(this.globalBucket);
    this.globalBucket.tokens = Math.min(
      this.globalBucket.tokens,
      ByokRateLimiter.GLOBAL_BURST_SIZE,
    );

    if (this.globalBucket.tokens >= 1) {
      this.globalBucket.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Calculate milliseconds until next token available
   */
  private getRetryAfterMs(bucket: TokenBucket): number {
    if (bucket.refillRatePerMs <= 0) return 1000;

    const tokensNeeded = 1 - bucket.tokens;
    const msNeeded = Math.ceil(tokensNeeded / bucket.refillRatePerMs);

    return Math.max(msNeeded, 100);
  }

  private evictStaleBucketsIfNeeded(): void {
    if (this.buckets.size <= ByokRateLimiter.MAX_BUCKETS) {
      return;
    }

    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefillAt > ByokRateLimiter.BUCKET_TTL_MS) {
        this.buckets.delete(key);
      }
    }
  }
}
