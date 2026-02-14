import { describe, it, expect } from "vitest";
import { MemoryPolicy } from "./index.js";

describe("MemoryPolicy", () => {
  describe("validateMemoryContent", () => {
    it("should accept valid content", () => {
      const policy = new MemoryPolicy();
      const result = policy.validateMemoryContent("Valid content");
      expect(result.valid).toBe(true);
    });

    it("should reject empty content", () => {
      const policy = new MemoryPolicy();
      const result = policy.validateMemoryContent("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    it("should reject content that is too long", () => {
      const policy = new MemoryPolicy();
      const longContent = "a".repeat(10001);
      const result = policy.validateMemoryContent(longContent);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum length");
    });

    it("should reject content with HTML tags", () => {
      const policy = new MemoryPolicy();
      const result = policy.validateMemoryContent(
        "<script>alert('xss')</script>",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("unsafe patterns");
    });

    it("should reject content with javascript: protocol", () => {
      const policy = new MemoryPolicy();
      const result = policy.validateMemoryContent("javascript:alert('xss')");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("unsafe patterns");
    });
  });

  describe("redactSensitiveContent", () => {
    it("should redact email addresses", () => {
      const policy = new MemoryPolicy();
      const content = "Contact me at test@example.com for details";
      const result = policy.redactSensitiveContent(content);
      expect(result).toContain("[EMAIL_REDACTED]");
      expect(result).not.toContain("test@example.com");
    });

    it("should redact credit card numbers", () => {
      const policy = new MemoryPolicy();
      const content = "Card number: 1234-5678-9012-3456";
      const result = policy.redactSensitiveContent(content);
      expect(result).toContain("[CARD_REDACTED]");
      expect(result).not.toContain("1234-5678-9012-3456");
    });

    it("should redact API keys", () => {
      const policy = new MemoryPolicy();
      const content = "api_key=sk-1234567890abcdef1234567890abcdef";
      const result = policy.redactSensitiveContent(content);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("sk-1234567890abcdef1234567890abcdef");
    });

    it("should redact passwords", () => {
      const policy = new MemoryPolicy();
      const content = "password: secret123";
      const result = policy.redactSensitiveContent(content);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("secret123");
    });

    it("should redact tokens", () => {
      const policy = new MemoryPolicy();
      const content = "token=bearer_token_value";
      const result = policy.redactSensitiveContent(content);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("bearer_token_value");
    });

    it("should redact secrets", () => {
      const policy = new MemoryPolicy();
      const content = "secret=my_secret_value";
      const result = policy.redactSensitiveContent(content);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("my_secret_value");
    });
  });

  describe("estimateTokens", () => {
    it("should estimate tokens correctly", () => {
      const policy = new MemoryPolicy();
      const content = "a".repeat(400); // 400 chars = ~100 tokens
      const tokens = policy.estimateTokens(content);
      expect(tokens).toBe(100);
    });
  });

  describe("truncateToTokenBudget", () => {
    it("should return content as-is if under budget", () => {
      const policy = new MemoryPolicy();
      const content = "Short content";
      const result = policy.truncateToTokenBudget(content, 100);
      expect(result).toBe(content);
    });

    it("should truncate content over budget", () => {
      const policy = new MemoryPolicy();
      const content = "a".repeat(1000); // 250 tokens
      const result = policy.truncateToTokenBudget(content, 100);
      expect(result.length).toBeLessThan(content.length);
      expect(result.endsWith("...")).toBe(true);
    });
  });

  describe("shouldCompact", () => {
    it("should suggest compaction when run events exceed threshold", () => {
      const policy = new MemoryPolicy({
        config: {
          maxTokensPerContext: 2000,
          maxEventsPerRun: 100,
          maxEventsPerSession: 500,
          compactionThreshold: 50,
          pinnedTag: "pinned",
        },
      });

      expect(policy.shouldCompact(51, "run")).toBe(true);
      expect(policy.shouldCompact(49, "run")).toBe(false);
    });

    it("should suggest compaction when session events exceed threshold", () => {
      const policy = new MemoryPolicy({
        config: {
          maxTokensPerContext: 2000,
          maxEventsPerRun: 100,
          maxEventsPerSession: 500,
          compactionThreshold: 50,
          pinnedTag: "pinned",
        },
      });

      expect(policy.shouldCompact(501, "session")).toBe(true);
      expect(policy.shouldCompact(49, "session")).toBe(false);
    });
  });
});
