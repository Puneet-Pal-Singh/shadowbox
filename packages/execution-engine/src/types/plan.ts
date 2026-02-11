/**
 * Plan and Step type definitions
 * Input from Phase 2 Planner
 */

import { z } from 'zod'

export const ToolCallSchema = z.object({
  id: z.string().min(1),
  toolName: z.string().min(1),
  arguments: z.record(z.unknown()),
  description: z.string().optional()
})

export type ToolCall = z.infer<typeof ToolCallSchema>

export const StepInputSchema = z.object({
  prompt: z.string().optional(),
  context: z.record(z.unknown()).optional(),
  requiredTools: z.array(z.string()).optional()
})

export type StepInput = z.infer<typeof StepInputSchema>

export const StepOutputSchema = z.object({
  type: z.string(),
  schema: z.record(z.unknown()).optional()
})

export type StepOutput = z.infer<typeof StepOutputSchema>

export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).max(5),
  backoffMs: z.number().int().min(100).optional()
})

export type RetryPolicy = z.infer<typeof RetryPolicySchema>

export const StepTypeSchema = z.enum(['analysis', 'code_change', 'review', 'tool_call'])

export type StepType = z.infer<typeof StepTypeSchema>

export const StepSchema = z.object({
  id: z.string().min(1),
  type: StepTypeSchema,
  title: z.string().min(1),
  description: z.string(),
  input: StepInputSchema,
  expectedOutput: StepOutputSchema.optional(),
  retryPolicy: RetryPolicySchema.optional()
})

export type Step = z.infer<typeof StepSchema>

export const PlanMetadataSchema = z.object({
  createdAt: z.string().datetime(),
  modelVersion: z.string().optional(),
  costEstimate: z.number().nonnegative().optional()
})

export type PlanMetadata = z.infer<typeof PlanMetadataSchema>

export const PlanSchema = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  description: z.string(),
  steps: z.array(StepSchema).min(1),
  metadata: PlanMetadataSchema.optional()
})

export type Plan = z.infer<typeof PlanSchema>
