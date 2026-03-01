/**
 * BYOK Preference Entity
 *
 * Workspace-level default provider/model selection.
 * Source of truth for "what's the default" in a workspace.
 */

import { z } from "zod";

/**
 * BYOKPreference - Workspace-level default provider/model selection
 *
 * This is the source of truth for "what's the default" in a workspace.
 * Users can override at request time, but preferences are the fallback.
 */
export const BYOKPreferenceSchema = z.object({
  /** User ID */
  userId: z.string().min(1),

  /** Workspace ID */
  workspaceId: z.string().min(1),

  /** Default provider selection */
  defaultProviderId: z.string().optional(),

  /** Default credential (if multiple exist for provider) */
  defaultCredentialId: z.string().uuid().optional(),

  /** Default model selection */
  defaultModelId: z.string().optional(),

  /** Fallback strategy: strict = no fallback, allow_fallback = use fallback chain */
  fallbackMode: z.enum(["strict", "allow_fallback"]).default("strict"),

  /** Ordered list of fallback provider IDs (when fallbackMode = 'allow_fallback') */
  fallbackChain: z.array(z.string()).default([]),

  /** Model visibility curation: per-provider list of visible model IDs */
  visibleModelIds: z.record(z.string(), z.array(z.string())).default({}),

  /** Last update timestamp */
  updatedAt: z.string().datetime(),
});

export type BYOKPreference = z.infer<typeof BYOKPreferenceSchema>;

/**
 * BYOKPreferencePatch - Request to update workspace preferences
 */
export const BYOKPreferencePatchSchema = z.object({
  defaultProviderId: z.string().optional(),
  defaultCredentialId: z.string().uuid().optional(),
  defaultModelId: z.string().optional(),
  fallbackMode: z.enum(["strict", "allow_fallback"]).optional(),
  fallbackChain: z.array(z.string()).optional(),
  visibleModelIds: z.record(z.string(), z.array(z.string())).optional(),
});

export type BYOKPreferencePatch = z.infer<typeof BYOKPreferencePatchSchema>;
