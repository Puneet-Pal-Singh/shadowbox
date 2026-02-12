// apps/brain/src/core/planner/PlanSchema.ts
// Phase 3B: Zod schemas for plan validation

import { z } from "zod";

/**
 * PlannedTask represents a single unit of work
 */
export const PlannedTaskSchema = z.object({
  id: z.string().min(1).max(50),
  type: z.enum(["analyze", "edit", "test", "review", "git", "shell"]),
  description: z.string().min(1).max(1000),
  dependsOn: z.array(z.string()).default([]),
  expectedOutput: z.string().optional(),
});

/**
 * Plan represents the structured output of the planning phase
 */
export const PlanSchema = z.object({
  tasks: z.array(PlannedTaskSchema).min(1).max(20),
  metadata: z.object({
    estimatedSteps: z.number().int().positive(),
    reasoning: z.string().optional(),
  }),
});

/**
 * TypeScript types - explicitly defined to match Zod output
 */
export interface PlannedTask {
  id: string;
  type: "analyze" | "edit" | "test" | "review" | "git" | "shell";
  description: string;
  dependsOn?: string[];
  expectedOutput?: string;
}

export interface Plan {
  tasks: PlannedTask[];
  metadata: {
    estimatedSteps: number;
    reasoning?: string;
  };
}

/**
 * Validates a plan against the schema
 * @param plan The plan object to validate
 * @returns The validated plan
 * @throws z.ZodError if validation fails
 */
export function validatePlan(plan: unknown): Plan {
  return PlanSchema.parse(plan);
}

/**
 * Safe plan validation that returns success/failure
 * @param plan The plan object to validate
 * @returns Result object with success flag and either data or error
 */
export function safeValidatePlan(
  plan: unknown,
): { success: true; data: Plan } | { success: false; error: z.ZodError } {
  const result = PlanSchema.safeParse(plan);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
