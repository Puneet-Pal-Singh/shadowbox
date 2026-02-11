/**
 * Tool Registry - Register and lookup tools by name
 */

import type { Tool, ToolDefinition } from './Tool.js'

/**
 * Registry for managing available tools
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map()

  /**
   * Register a tool
   */
  register(tool: Tool): void {
    const name = tool.getName()
    if (this.tools.has(name)) {
      console.warn(`[tools/registry] Tool '${name}' is already registered, overwriting`)
    }
    this.tools.set(name, tool)
  }

  /**
   * Register multiple tools at once
   */
  registerMultiple(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  /**
   * Get tool by name
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  /**
   * Check if tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * Get all available tool definitions
   */
  getAvailableTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.getDefinition())
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * Get number of registered tools
   */
  getToolCount(): number {
    return this.tools.size
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear()
  }
}
