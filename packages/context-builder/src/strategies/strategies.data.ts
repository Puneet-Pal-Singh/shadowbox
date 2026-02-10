/**
 * Intent → Strategy Mapping Table (Read-Only)
 *
 * Pure data structure. No logic.
 * Defines what context is included for each intent.
 */

import type { ContextStrategy } from '../types.js';

/**
 * Build the complete strategy mapping table
 */
export function buildStrategyMap(): Map<string, ContextStrategy> {
  return new Map([
    [
      'explore',
      {
        intent: 'explore',
        includeRepoSummary: true,
        includeFileList: true,
        includeTests: false,
        includeDiffs: false,
        includeChat: true,
        chatDepth: 3,
        blockPriorities: {
          REPO_SUMMARY: 10,
          FILE_LIST: 9,
          TESTS: 0,
          DIFFS: 0,
          CHAT: 5,
        },
      },
    ],
    [
      'bugfix',
      {
        intent: 'bugfix',
        includeRepoSummary: true,
        includeFileList: true,
        includeTests: true,
        includeDiffs: true,
        includeChat: true,
        chatDepth: 10,
        blockPriorities: {
          REPO_SUMMARY: 8,
          FILE_LIST: 9,
          TESTS: 8,
          DIFFS: 10,
          CHAT: 7,
        },
      },
    ],
    [
      'refactor',
      {
        intent: 'refactor',
        includeRepoSummary: true,
        includeFileList: true,
        includeTests: true,
        includeDiffs: true,
        includeChat: true,
        chatDepth: 5,
        blockPriorities: {
          REPO_SUMMARY: 7,
          FILE_LIST: 10,
          TESTS: 8,
          DIFFS: 9,
          CHAT: 5,
        },
      },
    ],
    [
      'implement',
      {
        intent: 'implement',
        includeRepoSummary: true,
        includeFileList: true,
        includeTests: true,
        includeDiffs: true,
        includeChat: true,
        chatDepth: 5,
        blockPriorities: {
          REPO_SUMMARY: 8,
          FILE_LIST: 10,
          TESTS: 7,
          DIFFS: 8,
          CHAT: 6,
        },
      },
    ],
    [
      'review',
      {
        intent: 'review',
        includeRepoSummary: false,
        includeFileList: false,
        includeTests: false,
        includeDiffs: true,
        includeChat: true,
        chatDepth: 3,
        blockPriorities: {
          REPO_SUMMARY: 0,
          FILE_LIST: 0,
          TESTS: 0,
          DIFFS: 10,
          CHAT: 5,
        },
      },
    ],
    [
      'meta',
      {
        intent: 'meta',
        includeRepoSummary: true,
        includeFileList: false,
        includeTests: false,
        includeDiffs: false,
        includeChat: true,
        chatDepth: 1,
        blockPriorities: {
          REPO_SUMMARY: 10,
          FILE_LIST: 0,
          TESTS: 0,
          DIFFS: 0,
          CHAT: 3,
        },
      },
    ],
  ]);
}

/**
 * Get strategy by intent type
 */
export function getStrategy(intent: string): ContextStrategy | undefined {
  return buildStrategyMap().get(intent);
}

/**
 * Get all available intents
 */
export function getAvailableIntents(): string[] {
  return Array.from(buildStrategyMap().keys());
}
