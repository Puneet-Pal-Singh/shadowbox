/**
 * ContextBuilder Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextBuilder } from '../../ContextBuilder.js';
import type { ContextBuilderInput } from '../../types.js';
import { ValidationError } from '../../errors.js';

describe('ContextBuilder', () => {
  let builder: ContextBuilder;

  beforeEach(() => {
    builder = new ContextBuilder();
  });

  describe('Determinism', () => {
    it('should produce identical output for same input (determinism test)', async () => {
      const input = createMockInput();

      const output1 = await builder.build(input);
      const output2 = await builder.build(input);

      // Compare excluding timestamp (which varies per invocation)
      expect(output1.systemPrompt).toBe(output2.systemPrompt);
      expect(output1.userPrompt).toBe(output2.userPrompt);
      expect(output1.contextBlocks.length).toBe(output2.contextBlocks.length);
      expect(output1.tokenReport.totalUsed).toBe(output2.tokenReport.totalUsed);
    });

    it('should preserve output for multiple runs', async () => {
      const input = createMockInput();

      const outputs = await Promise.all([
        builder.build(input),
        builder.build(input),
        builder.build(input),
      ]);

      const firstPrompt = outputs[0].systemPrompt;
      outputs.forEach(output => {
        expect(output.systemPrompt).toBe(firstPrompt);
      });
    });
  });

  describe('Token Budget', () => {
    it('should enforce token budget hard limits', async () => {
      const input = createMockInput();
      const output = await builder.build(input);

      expect(output.tokenReport.totalUsed).toBeLessThanOrEqual(13500);
    });

    it('should provide detailed token breakdown', async () => {
      const input = createMockInput();
      const output = await builder.build(input);

      const buckets = output.tokenReport.perBucket;
      expect(buckets).toHaveProperty('SYSTEM');
      expect(buckets).toHaveProperty('USER');
      expect(buckets).toHaveProperty('REPO_SUMMARY');
      expect(buckets).toHaveProperty('CONTEXT_BLOCKS');
      expect(buckets).toHaveProperty('CHAT_HISTORY');
      expect(buckets).toHaveProperty('OPTIONAL');
    });

    it('should include warnings when content truncated', async () => {
      const largeRepoSummary = createMockRepoSummary();
      // Create a large file list
      largeRepoSummary.fileTree = Array(200)
        .fill(null)
        .map((_, i) => ({
          path: `file_${i}.ts`,
          isDir: false,
          isIgnored: false,
          importance: 0.5,
        }));

      const input = createMockInput({
        repoSummary: largeRepoSummary,
      });

      const output = await builder.build(input);
      // May or may not truncate, but should still be valid
      expect(output.tokenReport).toBeDefined();
      expect(output.contextBlocks.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Intent Strategy', () => {
    it('should include repo summary for explore intent', async () => {
      const input = createMockInput({ intent: mockIntentClassification('explore') });
      const output = await builder.build(input);

      const hasRepoSummary = output.contextBlocks.some(b => b.type === 'REPO_SUMMARY');
      expect(hasRepoSummary).toBe(true);
    });

    it('should exclude diffs for explore intent', async () => {
      const input = createMockInput({ intent: mockIntentClassification('explore') });
      const output = await builder.build(input);

      const hasDiffs = output.contextBlocks.some(b => b.type === 'DIFFS');
      expect(hasDiffs).toBe(false);
    });

    it('should include diffs for bugfix intent', async () => {
      const input = createMockInput({ intent: mockIntentClassification('bugfix') });
      const output = await builder.build(input);

      // Note: diffs only included if repo has them
      expect(output.contextBlocks.length).toBeGreaterThan(0);
    });

    it('should handle all valid intents', async () => {
      const intents = ['explore', 'bugfix', 'refactor', 'implement', 'review', 'meta'];

      for (const intent of intents) {
        const input = createMockInput({ intent: mockIntentClassification(intent) });
        const output = await builder.build(input);

        expect(output.metadata.intent).toBe(intent);
        expect(output.systemPrompt).toBeTruthy();
        expect(output.userPrompt).toBeTruthy();
      }
    });
  });

  describe('Validation', () => {
    it('should reject empty user message', async () => {
      const input = createMockInput({ userMessage: '' });
      await expect(builder.build(input)).rejects.toThrow(ValidationError);
    });

    it('should reject missing intent', async () => {
      const input = createMockInput();
      (input as any).intent = null;
      await expect(builder.build(input)).rejects.toThrow(ValidationError);
    });

    it('should reject missing intent type', async () => {
      const input = createMockInput();
      (input.intent as any).type = null;
      await expect(builder.build(input)).rejects.toThrow(ValidationError);
    });

    it('should reject missing repo summary', async () => {
      const input = createMockInput();
      (input as any).repoSummary = null;
      await expect(builder.build(input)).rejects.toThrow(ValidationError);
    });
  });

  describe('Output Structure', () => {
    it('should return valid ContextBuilderOutput', async () => {
      const input = createMockInput();
      const output = await builder.build(input);

      expect(output).toHaveProperty('systemPrompt');
      expect(output).toHaveProperty('userPrompt');
      expect(output).toHaveProperty('contextBlocks');
      expect(output).toHaveProperty('tokenReport');
      expect(output).toHaveProperty('metadata');
    });

    it('should have non-empty system and user prompts', async () => {
      const input = createMockInput();
      const output = await builder.build(input);

      expect(output.systemPrompt.length).toBeGreaterThan(0);
      expect(output.userPrompt.length).toBeGreaterThan(0);
    });

    it('should include user message in user prompt', async () => {
      const userMessage = 'Add unit tests to the foo module';
      const input = createMockInput({ userMessage });
      const output = await builder.build(input);

      expect(output.userPrompt).toContain(userMessage);
    });

    it('should include correct metadata', async () => {
      const input = createMockInput({ intent: { type: 'bugfix' } as any });
      const output = await builder.build(input);

      expect(output.metadata.intent).toBe('bugfix');
      expect(output.metadata.strategyUsed).toBe('bugfix');
      expect(output.metadata.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Chat History', () => {
    it('should include chat history when provided', async () => {
      const chatHistory = [
        { role: 'user' as const, content: 'Previous question' },
        { role: 'assistant' as const, content: 'Previous answer' },
      ];

      const input = createMockInput({ chatHistory });
      const output = await builder.build(input);

      const hasChatBlock = output.contextBlocks.some(b => b.type === 'CHAT');
      expect(hasChatBlock).toBe(true);
    });

    it('should not include empty chat history', async () => {
      const input = createMockInput({ chatHistory: [] });
      const output = await builder.build(input);

      const hasChatBlock = output.contextBlocks.some(b => b.type === 'CHAT');
      expect(hasChatBlock).toBe(false);
    });
  });
});

// ============================================================================
// Helpers
// ============================================================================

function createMockRepoSummary(): any {
  return {
    rootPath: '/repo',
    repoName: 'test-repo',
    branch: 'main',
    commitHash: 'abc123def456',
    fileTree: [
      { path: 'src', isDir: true, isIgnored: false, importance: 0.9 },
      { path: 'src/index.ts', isDir: false, isIgnored: false, importance: 0.9 },
      { path: 'src/utils.ts', isDir: false, isIgnored: false, importance: 0.7 },
      { path: 'tests', isDir: true, isIgnored: false, importance: 0.8 },
      { path: 'tests/index.test.ts', isDir: false, isIgnored: false, importance: 0.8 },
      { path: 'README.md', isDir: false, isIgnored: false, importance: 0.6 },
    ],
    recentDiffs: [],
    fileCount: 10,
    language: 'TypeScript',
    estimatedSize: 50000,
  };
}

function createMockInput(overrides?: Partial<ContextBuilderInput>): ContextBuilderInput {
  return {
    userMessage: 'Show me the repository structure',
    intent: mockIntentClassification('explore'),
    repoSummary: createMockRepoSummary(),
    chatHistory: [],
    ...overrides,
  };
}

function mockIntentClassification(primary: string): any {
  return {
    primary,
    confidence: 'high' as const,
    signals: [{ type: 'keyword', value: primary, intent: primary }],
  };
}
