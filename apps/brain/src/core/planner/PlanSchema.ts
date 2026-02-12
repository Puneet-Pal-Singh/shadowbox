// apps/brain/src/core/planner/PlanSchema.ts
// Phase 3B: Zod schemas for plan validation

import { z } from "zod";

/**
 * PlannedTask represents a single unit of work
 */
export const PlannedTaskSchema = z
  .object({
    id: z.string().min(1).max(50),
    type: z.enum(["analyze", "edit", "test", "review", "git", "shell"]),
    description: z.string().min(1).max(1000),
    dependsOn: z.array(z.string()).default([]),
    expectedOutput: z.string().optional(),
  })
  .transform((task) => ({
    ...task,
    dependsOn: task.dependsOn as string[], // Ensure dependsOn is never undefined
  }));

/**
 * Plan represents the structured output of the planning phase
 */
export const PlanSchema = z
  .object({
    tasks: z.array(PlannedTaskSchema).min(1).max(20),
    metadata: z.object({
      estimatedSteps: z.number().int().positive(),
      reasoning: z.string().optional(),
    }),
  })
  .refine(
    (plan) => {
      // Validate referential integrity: all dependsOn IDs must exist in tasks
      const taskIds = new Set(plan.tasks.map((t) => t.id));
      return plan.tasks.every((task) => {
        // Check for self-reference
        if (task.dependsOn.includes(task.id)) {
          return false;
        }
        // Check all dependencies exist
        return task.dependsOn.every((depId) => taskIds.has(depId));
      });
    },
    {
      message:
        "Task dependencies must reference existing task IDs and cannot self-reference",
      path: ["tasks"],
    }
  );

/**
 * TypeScript types - inferred from Zod schemas for type safety
 */
export type PlannedTask = z.infer<typeof PlannedTaskSchema>;
export type Plan = z.infer<typeof PlanSchema>;

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
