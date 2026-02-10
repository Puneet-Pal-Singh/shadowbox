/**
 * Stop Conditions Zod Schemas
 *
 * Strict validation for stop conditions and policies.
 * Ensures plans cannot have invalid stop rules.
 */

import { z } from 'zod';
import type {
  StopCondition,
  StopConditionType,
  HardLimits,
  StopPolicy,
  ExecutionState,
  StopResult,
  StopReason,
} from './types.js';

// ============================================================================
// Stop Condition Type Schema
// ============================================================================

export const StopConditionTypeSchema = z.enum([
  'max_steps_reached',
  'goal_satisfied',
  'artifact_produced',
  'error_threshold_exceeded',
  'timeout_reached',
  'external_abort',
]);

// ============================================================================
// Stop Condition Schemas (Discriminated Union)
// ============================================================================

const MaxStepsSchema = z
  .object({
    type: z.literal('max_steps_reached'),
    maxSteps: z.number().int().min(1).max(20),
  })
  .strict();

const GoalSatisfiedSchema = z
  .object({
    type: z.literal('goal_satisfied'),
    goalDescription: z.string().min(5).max(300),
  })
  .strict();

const ArtifactProducedSchema = z
  .object({
    type: z.literal('artifact_produced'),
    artifactType: z.string().min(1).max(50),
  })
  .strict();

const ErrorThresholdSchema = z
  .object({
    type: z.literal('error_threshold_exceeded'),
    maxErrors: z.number().int().min(0).max(5),
  })
  .strict();

const TimeoutSchema = z
  .object({
    type: z.literal('timeout_reached'),
    maxDurationMs: z.number().int().min(100).max(3600000), // max 1 hour
  })
  .strict();

const ExternalAbortSchema = z
  .object({
    type: z.literal('external_abort'),
    reason: z.string().max(200).optional(),
  })
  .strict();

export const StopConditionSchema: z.ZodType<StopCondition> = z.union([
  MaxStepsSchema,
  GoalSatisfiedSchema,
  ArtifactProducedSchema,
  ErrorThresholdSchema,
  TimeoutSchema,
  ExternalAbortSchema,
]);

// ============================================================================
// Hard Limits Schema
// ============================================================================

export const HardLimitsSchema: z.ZodType<HardLimits> = z
  .object({
    maxSteps: z.number().int().min(1).max(20),
    maxErrors: z.number().int().min(0).max(5),
    maxDurationMs: z.number().int().min(100).max(3600000).optional(),
  })
  .strict();

// ============================================================================
// Stop Policy Schema
// ============================================================================

export const StopPolicySchema: z.ZodType<StopPolicy> = z
  .object({
    primary: StopConditionSchema,
    fallback: StopConditionSchema,
    hardLimits: HardLimitsSchema,
    priorityOrder: z.array(StopConditionTypeSchema).optional(),
  })
  .strict()
  .refine(
    (policy) => policy.primary.type !== policy.fallback.type,
    {
      message: 'fallback condition must have different type than primary',
      path: ['fallback'],
    }
  )
  .refine(
    (policy) => {
      // Check if primary maxSteps exceeds hard limit
      if (policy.primary.type === 'max_steps_reached') {
        return policy.primary.maxSteps <= policy.hardLimits.maxSteps;
      }
      return true;
    },
    {
      message: 'primary max_steps_reached cannot exceed hardLimits.maxSteps',
      path: ['primary'],
    }
  )
  .refine(
    (policy) => {
      // Check if fallback maxSteps exceeds hard limit
      if (policy.fallback.type === 'max_steps_reached') {
        return policy.fallback.maxSteps <= policy.hardLimits.maxSteps;
      }
      return true;
    },
    {
      message: 'fallback max_steps_reached cannot exceed hardLimits.maxSteps',
      path: ['fallback'],
    }
  )
  .refine(
    (policy) => {
      // Check if primary maxErrors exceeds hard limit
      if (policy.primary.type === 'error_threshold_exceeded') {
        return policy.primary.maxErrors <= policy.hardLimits.maxErrors;
      }
      return true;
    },
    {
      message: 'primary max_errors cannot exceed hardLimits.maxErrors',
      path: ['primary'],
    }
  )
  .refine(
    (policy) => {
      // Check if fallback maxErrors exceeds hard limit
      if (policy.fallback.type === 'error_threshold_exceeded') {
        return policy.fallback.maxErrors <= policy.hardLimits.maxErrors;
      }
      return true;
    },
    {
      message: 'fallback max_errors cannot exceed hardLimits.maxErrors',
      path: ['fallback'],
    }
  );

// ============================================================================
// Execution State Schema
// ============================================================================

export const ExecutionStateSchema: z.ZodType<ExecutionState> = z
  .object({
    stepsExecuted: z.number().int().min(0),
    stepsCompleted: z.number().int().min(0),
    errorCount: z.number().int().min(0),
    errorMessages: z.array(z.string()),
    durationMs: z.number().int().min(0),
    startedAt: z.number().int().min(0),
    artifacts: z.array(
      z.object({
        type: z.string().min(1),
        id: z.string().min(1),
        content: z.string().optional(),
      })
    ),
    outputs: z.record(z.unknown()),
    isRunning: z.boolean(),
    wasAborted: z.boolean(),
    abortReason: z.string().optional(),
  })
  .strict();

// ============================================================================
// Stop Reason Schema
// ============================================================================

export const StopReasonSchema = z.enum([
  'COMPLETED_SUCCESS',
  'COMPLETED_PARTIAL',
  'FAILED_HARD_LIMIT_STEPS',
  'FAILED_HARD_LIMIT_ERRORS',
  'FAILED_HARD_LIMIT_TIMEOUT',
  'FAILED_CONDITION_NOT_MET',
  'FAILED_TIMEOUT',
  'ABORTED_EXTERNAL',
]);

// ============================================================================
// Stop Result Schema
// ============================================================================

export const StopResultSchema: z.ZodType<StopResult> = z
  .object({
    shouldStop: z.boolean(),
    reason: StopReasonSchema,
    priority: z.number().int().min(0),
    details: z.object({
      condition: StopConditionSchema,
      executionTime: z.number().int().min(0),
      stepsCompleted: z.number().int().min(0),
      message: z.string().min(1),
    }),
  })
  .strict();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate a stop policy (throws on invalid)
 */
export function validateStopPolicy(data: unknown): StopPolicy {
  return StopPolicySchema.parse(data);
}

/**
 * Safe validation (returns error instead of throwing)
 */
export function safeParseStopPolicy(data: unknown): {
  success: boolean;
  data?: StopPolicy;
  error?: string;
} {
  const result = StopPolicySchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; '),
  };
}

/**
 * Validate execution state
 */
export function validateExecutionState(data: unknown): ExecutionState {
  return ExecutionStateSchema.parse(data);
}

/**
 * Validate stop result
 */
export function validateStopResult(data: unknown): StopResult {
  return StopResultSchema.parse(data);
}
