/**
 * Base Tool abstraction
 * All tools implement this interface
 */

import type { ExecutionContext, ToolResult } from '../types/index.js'

/**
 * Tool definition for registration
 */
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * Abstract tool base class
 */
export abstract class Tool {
  abstract getName(): string

  abstract getDescription(): string

  abstract getInputSchema(): Record<string, unknown>

  abstract execute(args: Record<string, unknown>, context: ExecutionContext): Promise<ToolResult>

  /**
   * Get tool definition for model consumption
   */
  getDefinition(): ToolDefinition {
    return {
      name: this.getName(),
      description: this.getDescription(),
      inputSchema: this.getInputSchema()
    }
  }
}
