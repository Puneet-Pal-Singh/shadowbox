/**
 * Output Validator - Parse and validate LLM responses
 */

import { z } from 'zod'
import type { ModelToolCall } from '../adapters/index.js'

/**
 * Parse JSON from markdown code blocks or raw JSON
 */
export function extractJSON(text: string): unknown {
  // Try markdown code block first
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch && jsonMatch[1]) {
    try {
      return JSON.parse(jsonMatch[1])
    } catch {
      // Fall through to raw JSON attempt
    }
  }

  // Try raw JSON
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Extract tool calls from text (looking for specific format)
 */
export function extractToolCalls(text: string): ModelToolCall[] {
  const toolCalls: ModelToolCall[] = []

  // Look for patterns like: <tool name="read_file" id="tool-1" args={"path": "/src/main.ts"}>
  // Pattern allows optional id attribute with leading \s+
  const pattern = /<tool\s+name="([^"]+)"(?:\s+id="([^"]+)")?\s+args='([^']+)'/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const toolName = match[1]
    const idMatch = match[2]
    const id = idMatch ? idMatch : `${toolName}-${Date.now()}`
    const argsStr = match[3]

    if (!toolName || !argsStr) {
      continue
    }

    try {
      const args = JSON.parse(argsStr) as Record<string, unknown>
      toolCalls.push({
        id,
        toolName,
        arguments: args
      })
    } catch (error) {
      console.error(`[output/validator] Failed to parse tool arguments for ${toolName}:`, error)
    }
  }

  return toolCalls
}

/**
 * Validate output against a Zod schema
 */
export function validateAgainstSchema<T>(
  data: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data)
    return { success: true, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      return { success: false, error: issues }
    }
    return { success: false, error: String(error) }
  }
}

/**
 * Format error message for structured output
 */
export function formatValidationError(
  fieldName: string,
  expected: string,
  received: unknown
): string {
  return `Field '${fieldName}' validation failed. Expected ${expected}, received: ${JSON.stringify(received)}`
}
