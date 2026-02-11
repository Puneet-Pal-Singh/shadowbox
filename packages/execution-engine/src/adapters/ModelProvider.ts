/**
 * Model Provider Interface - Abstract LLM interactions
 * Enables swapping between OpenAI, Anthropic, local models, etc.
 */

import { z } from 'zod'
import type { ExecutionContext, MemoryBlock } from '../types/index.js'

/**
 * Tool definition for model tool_use capability
 */
export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.record(z.unknown())
})

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>

/**
 * Model input request
 */
export const ModelInputSchema = z.object({
  systemPrompt: z.string(),
  userMessage: z.string(),
  context: z.record(z.unknown()),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  tools: z.array(ToolDefinitionSchema).optional()
})

export type ModelInput = z.infer<typeof ModelInputSchema>

/**
 * Tool call from model
 */
export const ModelToolCallSchema = z.object({
  id: z.string().min(1),
  toolName: z.string().min(1),
  arguments: z.record(z.unknown())
})

export type ModelToolCall = z.infer<typeof ModelToolCallSchema>

/**
 * Model output response
 */
export const ModelOutputSchema = z.object({
  content: z.string(),
  toolCalls: z.array(ModelToolCallSchema).optional(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative()
  }),
  stopReason: z.enum(['max_tokens', 'end_turn', 'tool_use', 'error'])
})

export type ModelOutput = z.infer<typeof ModelOutputSchema>

/**
 * Abstract model provider interface
 */
export interface ModelProvider {
  /**
   * Generate response from model
   */
  generate(input: ModelInput): Promise<ModelOutput>

  /**
   * Get provider name
   */
  getName(): string

  /**
   * Optional: check if provider is configured/available
   */
  isAvailable?(): Promise<boolean>
}

/**
 * Helper to build system prompt for step execution
 * Note: Sanitizes outputs to prevent sensitive data leakage
 */
export function buildSystemPrompt(
  basePrompt: string,
  context: ExecutionContext
): string {
  return `${basePrompt}

## Execution Context
- Run ID: ${context.runId}
- Task ID: ${context.taskId}
- Repo Path: ${context.repoPath}

## Previous Step Outputs
${buildOutputsSummary(context.previousStepOutputs)}

## Memory
${buildMemorySummary(context.memory)}
`
}

/**
 * Build sanitized summary of outputs (prevent data leakage)
 */
function buildOutputsSummary(outputs: Record<string, unknown>): string {
  if (Object.entries(outputs).length === 0) {
    return '(none)'
  }

  return Object.entries(outputs)
    .map(([key]) => `- ${key}: <output>`)
    .join('\n')
}

/**
 * Build sanitized summary of memory blocks
 */
function buildMemorySummary(memory: MemoryBlock[]): string {
  if (memory.length === 0) {
    return '(none)'
  }

  return memory.map(m => `- ${m.key}: <value>`).join('\n')
}

/**
 * Helper to build user message for step
 */
export function buildUserMessage(
  prompt: string,
  stepTitle: string,
  stepDescription: string
): string {
  return `## Step: ${stepTitle}
${stepDescription}

## Instructions
${prompt}`
}
