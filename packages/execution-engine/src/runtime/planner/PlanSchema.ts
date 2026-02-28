// apps/brain/src/core/planner/PlanSchema.ts
// Phase 3B: Zod schemas for plan validation

import { z } from "zod";

/**
 * PlannedTask represents a single unit of work
 * Phase 2: Extended with structured `input` field to preserve task parameters end-to-end
 */
export const PlannedTaskSchema = z
  .object({
    id: z.string().min(1).max(50),
    type: z.enum(["analyze", "edit", "test", "review", "git", "shell"]),
    description: z.string().min(1).max(1000),
    dependsOn: z.array(z.string()).default([]),
    expectedOutput: z.string().optional(),
    input: z.record(z.string(), z.unknown()).optional(),
  })
  .transform((task) => ({
    ...task,
    dependsOn: task.dependsOn as string[], // Ensure dependsOn is never undefined
  }))
  .refine(
    (task) => {
      // review tasks don't require structured input
      if (task.type === "review") {
        return true;
      }

      // All other task types MUST have structured input object
      if (!task.input || typeof task.input !== "object") {
        return false;
      }

      // Helper: detect if a string looks like a task description (vague) vs concrete value
      function isVagueDescription(str: string): boolean {
        // Descriptive phrases with gerunds or modal verbs
        const vaguePatterns = [
          /^(analyze|analyze the|check|check if|look at|examine|read the)/i,
          /^(if |when |make |ensure |install )/i,
          /^(find |search |locate |discover )/i,
        ];
        return vaguePatterns.some((p) => p.test(str));
      }

      // Validate required fields for each task type
      switch (task.type) {
        case "analyze":
          // Must have path field and it must look like a path, not a description
          return (
            typeof task.input.path === "string" &&
            task.input.path.length > 0 &&
            task.input.path.length < 500 &&
            !isVagueDescription(task.input.path)
          );
        case "edit":
          // Must have both path and content
          return (
            typeof task.input.path === "string" &&
            task.input.path.length > 0 &&
            task.input.path.length < 500 &&
            !isVagueDescription(task.input.path) &&
            typeof task.input.content === "string" &&
            task.input.content.length > 0
          );
        case "test":
          // Must have command field and it must look like a command, not a description
          return (
            typeof task.input.command === "string" &&
            task.input.command.length > 0 &&
            task.input.command.length < 500 &&
            !isVagueDescription(task.input.command)
          );
        case "shell":
          // Must have command field and it must look like a command, not a description
          return (
            typeof task.input.command === "string" &&
            task.input.command.length > 0 &&
            task.input.command.length < 500 &&
            !isVagueDescription(task.input.command)
          );
        case "git":
          // Must have action field (commit, push, etc)
          return (
            typeof task.input.action === "string" &&
            task.input.action.length > 0 &&
            task.input.action.length < 50 &&
            /^(commit|push|pull|status|diff|log|add|checkout|branch|merge|rebase|stash|clone|fetch|reset|tag)$/.test(
              task.input.action
            )
          );
        default:
          return false;
      }
    },
    {
      message:
        "Task input must be properly structured with concrete values: analyze tasks need real file paths (not descriptions), shell/test tasks need actual commands (not descriptions like 'check if X'), edit tasks need both path and content, git tasks need valid actions (commit, push, pull, etc)",
      path: ["input"],
    }
  );

/**
 * Plan represents the structured output of the planning phase
 */
export const PlanSchema = z
  .object({
    tasks: z.array(PlannedTaskSchema).min(1).max(20),
    metadata: z.object({
      estimatedSteps: z.coerce.number().int().positive(),
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
