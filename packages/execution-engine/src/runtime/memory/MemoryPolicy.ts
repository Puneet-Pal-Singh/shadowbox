import { type MemoryPolicyConfig, DEFAULT_MEMORY_POLICY } from "./types.js";

export interface MemoryPolicyDependencies {
  config?: MemoryPolicyConfig;
}

export class MemoryPolicy {
  private config: MemoryPolicyConfig;

  constructor(deps: MemoryPolicyDependencies = {}) {
    this.config = deps.config ?? DEFAULT_MEMORY_POLICY;
  }

  getMaxTokens(): number {
    return this.config.maxTokensPerContext;
  }

  getMaxEventsPerRun(): number {
    return this.config.maxEventsPerRun;
  }

  getMaxEventsPerSession(): number {
    return this.config.maxEventsPerSession;
  }

  getCompactionThreshold(): number {
    return this.config.compactionThreshold;
  }

  getPinnedTag(): string {
    return this.config.pinnedTag;
  }

  shouldCompact(eventCount: number, scope: "run" | "session"): boolean {
    const maxEvents =
      scope === "run"
        ? this.config.maxEventsPerRun
        : this.config.maxEventsPerSession;

    return (
      eventCount >= maxEvents || eventCount >= this.config.compactionThreshold
    );
  }

  calculateTokenBudget(options: { pinnedTokens: number; maxTokens: number }): {
    pinnedAllocation: number;
    remainingAllocation: number;
  } {
    const { pinnedTokens, maxTokens } = options;

    const pinnedAllocation = Math.min(
      pinnedTokens,
      Math.floor(maxTokens * 0.3),
    );

    const remainingAllocation = maxTokens - pinnedAllocation;

    return { pinnedAllocation, remainingAllocation };
  }

  prioritizeEventsForTruncation<
    T extends { confidence: number; createdAt: string },
  >(events: T[]): T[] {
    return [...events].sort((a, b) => {
      const confidenceDiff = a.confidence - b.confidence;
      if (Math.abs(confidenceDiff) > 0.1) {
        return confidenceDiff;
      }

      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeA - timeB;
    });
  }

  validateMemoryContent(content: string): {
    valid: boolean;
    error?: string;
  } {
    if (!content || content.trim().length === 0) {
      return { valid: false, error: "Memory content cannot be empty" };
    }

    if (content.length > 10000) {
      return {
        valid: false,
        error: `Memory content exceeds maximum length of 10000 characters (got ${content.length})`,
      };
    }

    const suspiciousPatterns = [
      /<script\b[^>]*>([\s\S]*?)<\/script>/gim,
      /on\w+\s*=\s*["']?[\s\S]*?["']?/gim,
      /javascript:\s*[\s\S]*/gim,
      /data:text\/html\s*[\s\S]*/gim,
      /<\s*iframe\b[\s\S]*?>/gim,
      /<\s*object\b[\s\S]*?>/gim,
      /<\s*embed\b[\s\S]*?>/gim,
      /expression\s*\([\s\S]*?\)/gim,
      /[<>]/g,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        return {
          valid: false,
          error: "Memory content contains potentially unsafe patterns",
        };
      }
    }

    return { valid: true };
  }

  redactSensitiveContent(content: string): string {
    const sensitivePatterns = [
      {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: "[EMAIL_REDACTED]",
      },
      {
        pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        replacement: "[CARD_REDACTED]",
      },
      { pattern: /\b[A-Za-z0-9]{32,}\b/g, replacement: "[TOKEN_REDACTED]" },
      { pattern: /password[=:]\s*\S+/gi, replacement: "password=[REDACTED]" },
      { pattern: /token[=:]\s*\S+/gi, replacement: "token=[REDACTED]" },
      { pattern: /api[_-]?key[=:]\s*\S+/gi, replacement: "api_key=[REDACTED]" },
      { pattern: /secret[=:]\s*\S+/gi, replacement: "secret=[REDACTED]" },
    ];

    let redacted = content;
    for (const { pattern, replacement } of sensitivePatterns) {
      redacted = redacted.replace(pattern, replacement);
    }

    return redacted;
  }

  estimateTokens(content: string): number {
    const avgCharsPerToken = 4;
    return Math.ceil(content.length / avgCharsPerToken);
  }

  truncateToTokenBudget(content: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokens(content);

    if (estimatedTokens <= maxTokens) {
      return content;
    }

    const targetChars = maxTokens * 4;
    const truncated = content.slice(0, targetChars - 3);
    return truncated + "...";
  }
}
