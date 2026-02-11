/**
 * Tool Executor - Safely execute tools with validation
 */

import type { ExecutionContext, ToolResult } from '../types/index.js'
import type { Tool, ToolDefinition } from './Tool.js'
import { ToolRegistry } from './ToolRegistry.js'
import { createToolResult } from '../types/index.js'

/**
 * Tool executor configuration
 */
export interface ToolExecutorConfig {
  /**
   * Default timeout for tool execution in ms
   */
  defaultTimeoutMs?: number

  /**
   * Maximum retry attempts for failed tools
   */
  maxRetries?: number
}

/**
 * Executes tools safely with validation and timeout
 */
export class ToolExecutor {
  private registry: ToolRegistry
  private defaultTimeoutMs: number
  private maxRetries: number

  constructor(config: ToolExecutorConfig = {}) {
    this.registry = new ToolRegistry()
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30000 // 30 seconds
    this.maxRetries = config.maxRetries ?? 1
  }

  /**
   * Register a tool
   */
  registerTool(tool: Tool): void {
    this.registry.register(tool)
  }

  /**
   * Register multiple tools
   */
  registerTools(tools: Tool[]): void {
    this.registry.registerMultiple(tools)
  }

  /**
   * Get available tool definitions
   */
  getAvailableTools(): ToolDefinition[] {
    return this.registry.getAvailableTools()
  }

  /**
   * Execute a tool
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ExecutionContext,
    timeoutMs?: number
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const timeout = timeoutMs ?? this.defaultTimeoutMs

    // Check if tool exists
    const tool = this.registry.getTool(toolName)
    if (!tool) {
      return createToolResult(
        toolName,
        args,
        'error',
        undefined,
        `Tool '${toolName}' not found. Available tools: ${this.registry.getToolNames().join(', ')}`
      )
    }

    // Execute with timeout
    return this.executeWithTimeout(tool, toolName, args, context, startTime, timeout)
  }

  private async executeWithTimeout(
    tool: Tool,
    toolName: string,
    args: Record<string, unknown>,
    context: ExecutionContext,
    startTime: number,
    timeoutMs: number
  ): Promise<ToolResult> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const result = await tool.execute(args, context)
      clearTimeout(timeoutId)

      const duration = Date.now() - startTime
      result.duration = duration
      result.timestamp = Date.now()

      return result
    } catch (error) {
      clearTimeout(timeoutId)

      const duration = Date.now() - startTime
      const errorMsg =
        error instanceof Error
          ? error.message
          : String(error)

      return createToolResult(toolName, args, 'error', undefined, errorMsg, duration)
    }
  }

  /**
   * Execute tool with automatic retries
   */
  async executeWithRetry(
    toolName: string,
    args: Record<string, unknown>,
    context: ExecutionContext,
    timeoutMs?: number
  ): Promise<ToolResult> {
    let lastResult: ToolResult | undefined

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      lastResult = await this.execute(toolName, args, context, timeoutMs)

      if (lastResult.status === 'success') {
        return lastResult
      }

      if (attempt < this.maxRetries) {
        console.warn(
          `[tools/executor] Tool '${toolName}' failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying...`
        )
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }
    }

    return lastResult!
  }
}
