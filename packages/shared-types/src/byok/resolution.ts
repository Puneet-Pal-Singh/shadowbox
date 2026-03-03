/**
 * BYOK Resolution Result
 *
 * Represents the resolved effective provider + model for a chat request.
 * Result of the resolution pipeline (request override → preference → fallback → platform default).
 */

import { z } from "zod";

/**
 * BYOKResolution - Resolved effective provider + model for a chat request
 *
 * This is the result of the resolution pipeline:
 * 1. Request override
 * 2. Session preference
 * 3. Workspace preference
 * 4. Platform fallback
 *
 * Note: credentialId may be empty string for platform fallback (no BYOK credential).
 */
export const BYOKResolutionSchema = z.object({
  /** Resolved provider ID */
  providerId: z.string().min(1),

  /** Resolved credential ID (empty string for platform fallback) */
  credentialId: z.string(),

  /** Resolved model ID */
  modelId: z.string().min(1),

  /** Which resolution step was used */
  resolvedAt: z.enum([
    "request_override",
    "session_preference",
    "workspace_preference",
    "platform_fallback",
    "platform_defaults",
  ]),

  /** Timestamp of resolution */
  resolvedAtTime: z.string().datetime(),

  /** Fallback was triggered (for observability) */
  fallbackUsed: z.boolean().default(false),
});

export type BYOKResolution = z.infer<typeof BYOKResolutionSchema>;

/**
 * BYOKResolveRequest - Request to resolve effective provider config
 *
 * Used in chat flow to determine which provider+key+model to use.
 */
export const BYOKResolveRequestSchema = z.object({
  /** Override provider (optional) */
  providerId: z.string().optional(),

  /** Override credential (optional) */
  credentialId: z.string().uuid().optional(),

  /** Override model (optional) */
  modelId: z.string().optional(),

  /** Session ID (for preference lookup) */
  sessionId: z.string().optional(),
});

export type BYOKResolveRequest = z.infer<typeof BYOKResolveRequestSchema>;
