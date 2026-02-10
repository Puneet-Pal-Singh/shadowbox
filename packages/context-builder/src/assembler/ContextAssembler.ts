/**
 * Context Assembler
 *
 * Assembles context blocks based on intent strategy.
 * Normalizes repo data, files, diffs, and history into blocks.
 */

import type {
  ContextBuilderInput,
  ContextBlock,
  ContextStrategy,
  ContextBlockType,
} from '../types.js';

/**
 * Assembles context blocks based on strategy
 *
 * @example
 * const assembler = new ContextAssembler();
 * const blocks = await assembler.assemble(input, strategy);
 */
export class ContextAssembler {
  /**
   * Assemble context blocks from input and strategy
   */
  async assemble(input: ContextBuilderInput, strategy: ContextStrategy): Promise<ContextBlock[]> {
    const blocks: ContextBlock[] = [];

    // 1. Add repo summary block
    if (strategy.includeRepoSummary) {
      blocks.push(assembleRepoSummaryBlock(input.repoSummary));
    }

    // 2. Add file list block
    if (strategy.includeFileList) {
      blocks.push(assembleFileListBlock(input.repoSummary));
    }

    // 3. Add diffs block
    if (strategy.includeDiffs && input.repoSummary) {
      const diffsBlock = assembleDiffsBlock(input.repoSummary);
      if (diffsBlock) {
        blocks.push(diffsBlock);
      }
    }

    // 4. Add chat history block
    if (strategy.includeChat && input.chatHistory?.length) {
      const chatBlock = assembleChatBlock(input.chatHistory, strategy.chatDepth);
      if (chatBlock) {
        blocks.push(chatBlock);
      }
    }

    // 5. Apply block priorities from strategy
    blocks.forEach(block => {
      const priority = strategy.blockPriorities[block.type as ContextBlockType];
      if (priority !== undefined) {
        block.priority = priority;
      }
    });

    // 6. Sort by priority (descending)
    blocks.sort((a, b) => b.priority - a.priority);

    return blocks;
  }
}

/**
 * Assemble repo summary block
 */
function assembleRepoSummaryBlock(repoSummary: unknown): ContextBlock {
  const repo = repoSummary as any;
  const lines: string[] = [
    `Repository: ${repo.repoName}`,
    `Branch: ${repo.branch}`,
    `Commit: ${repo.commitHash.substring(0, 7)}`,
    `Language: ${repo.language || 'Unknown'}`,
    `Files: ${repo.fileCount}`,
    '',
    '## Structure',
    '',
  ];

  // Add directory tree (depth 1-2 only)
  if (repo.fileTree && repo.fileTree.length > 0) {
    const tree = repo.fileTree
      .filter((f: any) => !f.isIgnored)
      .slice(0, 50) // Limit to 50 items
      .map((f: any) => {
        const indent = f.path.split('/').length > 1 ? '  ' : '';
        const icon = f.isDir ? '📁' : '📄';
        const name = f.path.split('/').pop() || f.path;
        return `${indent}${icon} ${name}`;
      });

    lines.push(...tree);
  }

  const content = lines.join('\n');

  return {
    id: 'repo-summary',
    type: 'REPO_SUMMARY',
    priority: 10,
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Assemble file list block
 */
function assembleFileListBlock(repoSummary: unknown): ContextBlock {
  const repo = repoSummary as any;
  const lines: string[] = ['## Recent Files', ''];

  if (repo.fileTree && repo.fileTree.length > 0) {
    const files = repo.fileTree
      .filter((f: any) => !f.isDir && !f.isIgnored)
      .slice(0, 20)
      .map((f: any) => `- ${f.path}`);

    lines.push(...files);
  }

  const content = lines.join('\n');

  return {
    id: 'file-list',
    type: 'FILE_LIST',
    priority: 9,
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Assemble diffs block (if available)
 */
function assembleDiffsBlock(repoSummary: unknown): ContextBlock | null {
  const repo = repoSummary as any;
  if (!repo.recentDiffs || repo.recentDiffs.length === 0) {
    return null;
  }

  const lines: string[] = ['## Recent Changes', ''];

  repo.recentDiffs.slice(0, 10).forEach((diff: any) => {
    lines.push(`### ${diff.filePath}`);
    lines.push(`Status: ${diff.status}`);
    lines.push('```');
    lines.push(diff.hunks.join('\n'));
    lines.push('```');
    lines.push('');
  });

  const content = lines.join('\n');

  return {
    id: 'diffs',
    type: 'DIFFS',
    priority: 8,
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Assemble chat history block (if available)
 */
function assembleChatBlock(chatHistory: any[], depth: number): ContextBlock | null {
  if (!chatHistory || chatHistory.length === 0) {
    return null;
  }

  const recentMessages = chatHistory.slice(-depth);
  const lines: string[] = ['## Conversation History', ''];

  recentMessages.forEach(msg => {
    const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
    lines.push(`${role}:`);
    lines.push(msg.content);
    lines.push('');
  });

  const content = lines.join('\n');

  return {
    id: 'chat',
    type: 'CHAT',
    priority: 5,
    content,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Simple token estimation (words * 1.3)
 * Used before final token counting
 */
function estimateTokens(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.ceil(words * 1.3);
}
