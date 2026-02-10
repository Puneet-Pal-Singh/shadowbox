/**
 * Prompt Composer
 *
 * Assembles final system and user prompts from context blocks.
 * Creates the input for the LLM.
 */

import type { ContextBlock } from '../types.js';

/**
 * Fixed system prompt (used consistently for budget calculation and composition)
 */
const SYSTEM_PROMPT = `You are a helpful AI assistant specialized in reading, understanding, and modifying code repositories.

You have access to the following context about the repository structure, recent changes, and conversation history.
Use this information to understand the codebase and respond to the user's requests accurately and thoughtfully.

Guidelines:
- Be concise and direct in your responses
- Explain your reasoning and approach
- Respect the user's intent and preferences
- Ask for clarification if you need more information
- Provide code examples when relevant
- Consider the impact of changes on the broader codebase

When making code changes:
1. Explain what you're changing and why
2. Consider error handling and edge cases
3. Follow existing code patterns and conventions
4. Test your changes mentally or suggest test cases`;

/**
 * Composes final prompts from context blocks
 *
 * @example
 * const composer = new PromptComposer();
 * const { systemPrompt, userPrompt } = composer.compose(blocks, userMessage);
 */
export class PromptComposer {
  /**
   * Get the fixed system prompt
   */
  getSystemPrompt(): string {
    return SYSTEM_PROMPT;
  }

  /**
   * Compose system and user prompts
   */
  compose(
    blocks: ContextBlock[],
    userMessage: string
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = SYSTEM_PROMPT;
    const userPrompt = this.buildUserPrompt(blocks, userMessage);

    return { systemPrompt, userPrompt };
  }

  /**
   * Build user prompt (context + message)
   */
  private buildUserPrompt(blocks: ContextBlock[], userMessage: string): string {
    const lines: string[] = [];

    // Add context blocks
    if (blocks.length > 0) {
      lines.push('## Repository Context\n');

      blocks.forEach(block => {
        lines.push(`### ${block.type.replace(/_/g, ' ')}\n`);
        lines.push(block.content);
        lines.push('\n');
      });

      lines.push('\n---\n');
    }

    // Add user message
    lines.push('## Your Request\n');
    lines.push(userMessage);

    return lines.join('\n');
  }
}
