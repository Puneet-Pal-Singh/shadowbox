/**
 * ExecuteRunPayloadSchema - Zod schema for runtime execute requests.
 *
 * Single Responsibility: Define and validate the execute payload contract.
 */

import { z } from "zod";

/**
 * Core message schema for AI SDK messages.
 * Supports user, assistant, system, and tool messages.
 */
const CoreMessageSchema = z.union([
  z.object({ role: z.literal("system"), content: z.string() }),
  z.object({ role: z.literal("user"), content: z.unknown() }),
  z.object({
    role: z.literal("assistant"),
    content: z.unknown(),
    tool_calls: z.array(z.unknown()).optional(),
  }),
  z.object({
    role: z.literal("tool"),
    content: z.unknown(),
    tool_call_id: z.string(),
  }),
]);

/**
 * Request payload for RunEngine.execute().
 *
 * Contract:
 * - runId: execution run identifier (required)
 * - sessionId: user session identifier (required)
 * - correlationId: request tracing ID (required)
 * - requestOrigin: CORS origin (optional)
 * - input: agent execution parameters
 *   - agentType: coding | review | ci (required)
 *   - prompt: user prompt text (required, non-empty)
 *   - sessionId: user session (required)
 *   - providerId: provider override (optional, must pair with modelId)
 *   - modelId: model override (optional, must pair with providerId)
 * - messages: conversation history (required, array of CoreMessage)
 */
export const ExecuteRunPayloadSchema = z.object({
  runId: z.string().trim().min(1),
  userId: z.string().trim().min(1).optional(),
  workspaceId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1),
  correlationId: z.string().trim().min(1),
  requestOrigin: z.string().trim().min(1).optional(),
  input: z
    .object({
      agentType: z.enum(["coding", "review", "ci"]),
      prompt: z.string().trim().min(1),
      sessionId: z.string().trim().min(1),
      providerId: z.string().trim().min(1).optional(),
      modelId: z.string().trim().min(1).optional(),
      repositoryContext: z
        .object({
          owner: z.string().trim().min(1).optional(),
          repo: z.string().trim().min(1).optional(),
          branch: z.string().trim().min(1).optional(),
          baseUrl: z.string().trim().min(1).optional(),
        })
        .optional()
        .superRefine((context, refinementCtx) => {
          if (!context) {
            return;
          }

          const hasOwner = typeof context.owner === "string";
          const hasRepo = typeof context.repo === "string";
          if (hasOwner !== hasRepo) {
            refinementCtx.addIssue({
              code: z.ZodIssueCode.custom,
              path: hasOwner ? ["repo"] : ["owner"],
              message:
                "repositoryContext.owner and repositoryContext.repo must be provided together",
            });
          }
        }),
    })
    .superRefine((input, refinementCtx) => {
      const hasProviderId = typeof input.providerId === "string";
      const hasModelId = typeof input.modelId === "string";
      if (hasProviderId !== hasModelId) {
        refinementCtx.addIssue({
          code: z.ZodIssueCode.custom,
          path: hasProviderId ? ["modelId"] : ["providerId"],
          message:
            "input.providerId and input.modelId must be provided together or both omitted",
        });
      }
    }),
  messages: z.array(CoreMessageSchema).min(1),
});

/**
 * Typed version of the payload.
 */
export type ExecuteRunPayload = z.infer<typeof ExecuteRunPayloadSchema>;
