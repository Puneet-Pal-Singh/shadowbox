/**
 * Execution state and context type definitions
 */

import { z } from 'zod'
import type { Step } from './plan.js'

export const TokenUsageSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  total: z.number().nonnegative()
})

export type TokenUsage = z.infer<typeof TokenUsageSchema>

export const ExecutionStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'stopped'])

export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>

export const StopReasonSchema = z.enum([
  'budget_exhausted',
  'max_iterations',
  'goal_satisfied',
  'timeout',
  'error'
])

export type StopReason = z.infer<typeof StopReasonSchema>

export const MemoryBlockSchema = z.object({
  stepId: z.string().min(1),
  key: z.string().min(1),
  value: z.unknown(),
  timestamp: z.number().int().positive(),
  mutable: z.boolean()
})

export type MemoryBlock = z.infer<typeof MemoryBlockSchema>

export const ExecutionContextSchema = z.object({
  runId: z.string().min(1),
  taskId: z.string().min(1),
  repoPath: z.string().min(1),
  repoSnapshot: z.array(z.string()).optional(),
  currentStep: z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    description: z.string(),
    input: z.record(z.unknown())
  }),
  previousStepOutputs: z.record(z.unknown()),
  memory: z.array(MemoryBlockSchema),
  environment: z.record(z.string())
})

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>

export const ExecutionStateSchema = z.object({
  runId: z.string().min(1),
  planId: z.string().min(1),
  currentStepIndex: z.number().int().min(0),
  status: ExecutionStatusSchema,
  stopReason: StopReasonSchema.optional(),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive().optional(),
  iterationCount: z.number().int().min(0),
  tokenUsage: TokenUsageSchema,
  artifacts: z.array(z.any()),
  stepResults: z.record(z.unknown()),
  errors: z.array(z.any())
})

export type ExecutionState = z.infer<typeof ExecutionStateSchema>

/**
 * Build an ExecutionContext from plan and repo info
 */
export function createExecutionContext(
  runId: string,
  taskId: string,
  repoPath: string,
  currentStep: Step,
  previousStepOutputs: Record<string, unknown> = {},
  memory: MemoryBlock[] = [],
  environment: Record<string, string> = {}
): ExecutionContext {
  return {
    runId,
    taskId,
    repoPath,
    currentStep: {
      id: currentStep.id,
      type: currentStep.type,
      title: currentStep.title,
      description: currentStep.description,
      input: currentStep.input
    },
    previousStepOutputs,
    memory,
    environment
  }
}

/**
 * Initialize execution state for a plan
 */
export function initializeExecutionState(
  runId: string,
  planId: string
): ExecutionState {
  const now = Date.now()
  return {
    runId,
    planId,
    currentStepIndex: 0,
    status: 'pending',
    startTime: now,
    iterationCount: 0,
    tokenUsage: {
      input: 0,
      output: 0,
      total: 0
    },
    artifacts: [],
    stepResults: {},
    errors: []
  }
}
