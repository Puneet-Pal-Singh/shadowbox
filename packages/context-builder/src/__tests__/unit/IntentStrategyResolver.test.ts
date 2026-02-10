/**
 * IntentStrategyResolver Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { IntentStrategyResolver } from '../../strategies/IntentStrategyResolver.js';

describe('IntentStrategyResolver', () => {
  const resolver = new IntentStrategyResolver();

  describe('Strategy Resolution', () => {
    it('should resolve explore intent', () => {
      const strategy = resolver.resolve('explore');
      expect(strategy.intent).toBe('explore');
      expect(strategy.includeRepoSummary).toBe(true);
      expect(strategy.includeFileList).toBe(true);
      expect(strategy.includeDiffs).toBe(false);
    });

    it('should resolve bugfix intent', () => {
      const strategy = resolver.resolve('bugfix');
      expect(strategy.intent).toBe('bugfix');
      expect(strategy.includeRepoSummary).toBe(true);
      expect(strategy.includeFileList).toBe(true);
      expect(strategy.includeDiffs).toBe(true);
      expect(strategy.chatDepth).toBe(10);
    });

    it('should resolve refactor intent', () => {
      const strategy = resolver.resolve('refactor');
      expect(strategy.intent).toBe('refactor');
      expect(strategy.includeFileList).toBe(true);
    });

    it('should resolve implement intent', () => {
      const strategy = resolver.resolve('implement');
      expect(strategy.intent).toBe('implement');
      expect(strategy.includeFileList).toBe(true);
    });

    it('should resolve review intent', () => {
      const strategy = resolver.resolve('review');
      expect(strategy.intent).toBe('review');
      expect(strategy.includeRepoSummary).toBe(false);
      expect(strategy.includeDiffs).toBe(true);
    });

    it('should resolve meta intent', () => {
      const strategy = resolver.resolve('meta');
      expect(strategy.intent).toBe('meta');
      expect(strategy.includeRepoSummary).toBe(true);
      expect(strategy.includeFileList).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw on unknown intent', () => {
      expect(() => resolver.resolve('unknown-intent')).toThrow();
    });

    it('should throw with helpful message', () => {
      expect(() => resolver.resolve('foobar')).toThrow(/Available intents:/);
    });
  });

  describe('Intent Checking', () => {
    it('should check if intent exists', () => {
      expect(resolver.has('explore')).toBe(true);
      expect(resolver.has('bugfix')).toBe(true);
      expect(resolver.has('unknown')).toBe(false);
    });
  });

  describe('Available Intents', () => {
    it('should list all available intents', () => {
      const intents = resolver.getAvailableIntents();
      expect(intents).toContain('explore');
      expect(intents).toContain('bugfix');
      expect(intents).toContain('refactor');
      expect(intents).toContain('implement');
      expect(intents).toContain('review');
      expect(intents).toContain('meta');
    });

    it('should return non-empty intent list', () => {
      const intents = resolver.getAvailableIntents();
      expect(intents.length).toBeGreaterThan(0);
    });
  });

  describe('Block Priorities', () => {
    it('should define block priorities for each intent', () => {
      const intents = resolver.getAvailableIntents();

      intents.forEach(intent => {
        const strategy = resolver.resolve(intent);
        expect(strategy.blockPriorities).toBeDefined();
        expect(strategy.blockPriorities['REPO_SUMMARY']).toBeGreaterThanOrEqual(0);
      });
    });

    it('should prioritize correctly for bugfix', () => {
      const strategy = resolver.resolve('bugfix');
      // Diffs should be highest priority for bugfix
      expect(strategy.blockPriorities['DIFFS']).toBe(10);
    });

    it('should prioritize correctly for implement', () => {
      const strategy = resolver.resolve('implement');
      // Files should be highest priority for implement
      expect(strategy.blockPriorities['FILE_LIST']).toBe(10);
    });
  });
});
