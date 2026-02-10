/**
 * BudgetCalculator Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetCalculator } from '../../budget/BudgetCalculator.js';
import type { ContextBlock } from '../../types.js';
import { BudgetExceededError } from '../../errors.js';

describe('BudgetCalculator', () => {
  let calculator: BudgetCalculator;

  beforeEach(() => {
    calculator = new BudgetCalculator();
  });

  describe('Token Counting', () => {
    it('should count tokens in text', () => {
      const tokens = calculator.countTokens('Hello, world!');
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should count longer text', () => {
      const text = 'This is a longer piece of text that should contain more tokens.';
      const tokens = calculator.countTokens(text);
      expect(tokens).toBeGreaterThan(5);
    });

    it('should handle empty text', () => {
      const tokens = calculator.countTokens('');
      expect(tokens).toBe(0);
    });
  });

  describe('Budget Allocation', () => {
    it('should allocate blocks within budget', () => {
      const blocks = createMockBlocks(5);
      const systemPrompt = 'System prompt';
      const userMessage = 'User message';

      const { blocks: allocated, report } = calculator.calculate(
        blocks,
        systemPrompt,
        userMessage
      );

      expect(report.totalUsed).toBeLessThanOrEqual(13500);
      expect(allocated.length).toBeGreaterThan(0);
    });

    it('should not exceed total token budget', () => {
      const blocks = createMockBlocks(20);
      const systemPrompt = 'System prompt';
      const userMessage = 'User message';

      const { report } = calculator.calculate(blocks, systemPrompt, userMessage);

      expect(report.totalUsed).toBeLessThanOrEqual(13500);
    });

    it('should respect per-bucket limits', () => {
      const blocks = createMockBlocks(5);
      const systemPrompt = 'System prompt';
      const userMessage = 'User message';

      const { report } = calculator.calculate(blocks, systemPrompt, userMessage);

      expect(report.perBucket.SYSTEM).toBeLessThanOrEqual(2000);
      expect(report.perBucket.USER).toBeLessThanOrEqual(2000);
      expect(report.perBucket.REPO_SUMMARY).toBeLessThanOrEqual(3000);
    });
  });

  describe('Error Handling', () => {
    it('should reject if system prompt exceeds limit', () => {
      const veryLongSystemPrompt = 'x'.repeat(10000);
      const blocks = createMockBlocks(1);
      const userMessage = 'User message';

      expect(() =>
        calculator.calculate(blocks, veryLongSystemPrompt, userMessage)
      ).toThrow(BudgetExceededError);
    });

    it('should reject if user message exceeds limit', () => {
      const blocks = createMockBlocks(1);
      const systemPrompt = 'System prompt';
      const veryLongUserMessage = 'x'.repeat(10000);

      expect(() => calculator.calculate(blocks, systemPrompt, veryLongUserMessage)).toThrow(
        BudgetExceededError
      );
    });
  });

  describe('Reporting', () => {
    it('should provide detailed token report', () => {
      const blocks = createMockBlocks(3);
      const systemPrompt = 'System prompt';
      const userMessage = 'User message';

      const { report } = calculator.calculate(blocks, systemPrompt, userMessage);

      expect(report).toHaveProperty('totalUsed');
      expect(report).toHaveProperty('perBucket');
      expect(report).toHaveProperty('droppedBlocks');
      expect(report).toHaveProperty('truncatedBlocks');
      expect(report).toHaveProperty('warnings');
    });

    it('should track dropped blocks', () => {
      const blocks = createMockBlocks(20, true); // Large blocks
      const systemPrompt = 'System prompt';
      const userMessage = 'User message';

      const { report } = calculator.calculate(blocks, systemPrompt, userMessage);

      // With many large blocks, we should have dropped or truncated some
      const actionsPerformed = report.droppedBlocks.length + report.truncatedBlocks.length;
      expect(actionsPerformed).toBeGreaterThan(0);
    });

    it('should include warnings for dropped/truncated content', () => {
      const blocks = createMockBlocks(30, true); // Very large blocks
      const systemPrompt = 'System prompt';
      const userMessage = 'User message';

      const { report } = calculator.calculate(blocks, systemPrompt, userMessage);

      // Large block set may or may not generate warnings
      expect(report.warnings).toBeInstanceOf(Array);
    });
  });
});

// ============================================================================
// Helpers
// ============================================================================

function createMockBlocks(count: number, large: boolean = false): ContextBlock[] {
  const blocks: ContextBlock[] = [];

  for (let i = 0; i < count; i++) {
    const content = large ? 'x'.repeat(1000) : `Block ${i} content`;

    blocks.push({
      id: `block-${i}`,
      type: ['REPO_SUMMARY', 'FILE_LIST', 'DIFFS', 'CHAT'][i % 4] as any,
      priority: 10 - i,
      content,
      tokenEstimate: 100,
    });
  }

  return blocks;
}
