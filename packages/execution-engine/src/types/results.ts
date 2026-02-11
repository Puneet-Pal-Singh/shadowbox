/**
 * Step and tool execution result types
 */

import { z } from 'zod'

export const LogLevelSchema = z.enum(['info', 'debug', 'warn', 'error'])

export type LogLevel = z.infer<typeof LogLevelSchema>

export const LogEntrySchema = z.object({
  level: LogLevelSchema,
  message: z.string(),
  context: z.record(z.unknown()).optional(),
  timestamp: z.number().int().positive()
})

export type LogEntry = z.infer<typeof LogEntrySchema>

export const ToolResultStatusSchema = z.enum(['success', 'error'])

export type ToolResultStatus = z.infer<typeof ToolResultStatusSchema>

export const ToolResultSchema = z.object({
  toolName: z.string().min(1),
  arguments: z.record(z.unknown()),
  status: ToolResultStatusSchema,
  output: z.unknown().optional(),
  error: z.string().optional(),
  duration: z.number().nonnegative(),
  timestamp: z.number().int().positive()
})

export type ToolResult = z.infer<typeof ToolResultSchema>

export const ToolCallResultSchema = z.object({
  id: z.string().min(1),
  toolName: z.string().min(1),
  arguments: z.record(z.unknown()),
  result: ToolResultSchema,
  description: z.string().optional()
})

export type ToolCallResult = z.infer<typeof ToolCallResultSchema>

export const StepResultStatusSchema = z.enum(['success', 'error', 'timeout'])

export type StepResultStatus = z.infer<typeof StepResultStatusSchema>

export const StepResultSchema = z.object({
  stepId: z.string().min(1),
  status: StepResultStatusSchema,
  output: z.unknown().optional(),
  toolCalls: z.array(ToolCallResultSchema).optional(),
  logs: z.array(LogEntrySchema),
  duration: z.number().nonnegative(),
  timestamp: z.number().int().positive(),
  retryCount: z.number().int().min(0)
})

export type StepResult = z.infer<typeof StepResultSchema>

/**
 * Create a log entry with current timestamp
 */
export function createLogEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): LogEntry {
  return {
    level,
    message,
    context,
    timestamp: Date.now()
  }
}

/**
 * Create a tool result from execution
 */
export function createToolResult(
  toolName: string,
  args: Record<string, unknown>,
  status: ToolResultStatus,
  output?: unknown,
  error?: string,
  duration: number = 0
): ToolResult {
  return {
    toolName,
    arguments: args,
    status,
    output,
    error,
    duration,
    timestamp: Date.now()
  }
}

/**
 * Create a step result from execution
 */
export function createStepResult(
  stepId: string,
  status: StepResultStatus,
  duration: number = 0,
  output?: unknown,
  toolCalls?: ToolCallResult[],
  logs: LogEntry[] = [],
  retryCount: number = 0
): StepResult {
  return {
    stepId,
    status,
    output,
    toolCalls,
    logs,
    duration,
    timestamp: Date.now(),
    retryCount
  }
}
