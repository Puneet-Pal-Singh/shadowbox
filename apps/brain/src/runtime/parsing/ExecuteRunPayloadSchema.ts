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
  runId: z.string().min(1),
  userId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  sessionId: z.string().min(1),
  correlationId: z.string().min(1),
  requestOrigin: z.string().optional(),
  input: z.object({
    agentType: z.enum(["coding", "review", "ci"]),
    prompt: z.string().min(1),
    sessionId: z.string().min(1),
    providerId: z.string().min(1).optional(),
    modelId: z.string().min(1).optional(),
  }),
  messages: z.array(CoreMessageSchema),
});

/**
 * Typed version of the payload.
 */
export type ExecuteRunPayload = z.infer<typeof ExecuteRunPayloadSchema>;
