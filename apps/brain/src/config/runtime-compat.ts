/**
 * Runtime Compatibility Mode Configuration
 *
 * Controls fallback behavior in strict vs compat mode:
 * - Strict mode (default): No silent fallbacks, explicit errors returned
 * - Compat mode: Allows fallback with structured logging of reason codes
 *
 * Flag: BRAIN_RUNTIME_COMPAT_MODE
 * - "0" or unset: Strict mode (default, recommended for production)
 * - "1": Compat mode (for emergency rollback only)
 *
 * Note: In Cloudflare Workers, process.env may not be available.
 * Uses globalThis marker as fallback for testing environments.
 */

let compatModeOverride: boolean | undefined;

/**
 * Set compat mode override (for testing)
 */
export function setCompatModeOverride(enabled: boolean): void {
  compatModeOverride = enabled;
}

/**
 * Check if compat mode is enabled
 * First checks override flag, then process.env, then defaults to strict mode
 */
export function isCompatModeEnabled(): boolean {
  if (compatModeOverride !== undefined) {
    return compatModeOverride;
  }
  // Check process.env if available (Node.js, local dev)
  if (typeof process !== "undefined" && process.env?.BRAIN_RUNTIME_COMPAT_MODE === "1") {
    return true;
  }
  // Default to strict mode
  return false;
}

export function isStrictMode(): boolean {
  return !isCompatModeEnabled();
}

/**
 * Compat fallback reason codes (only used when BRAIN_RUNTIME_COMPAT_MODE=1)
 * These provide structured logging of why a fallback occurred.
 */
export const CompatFallbackReasonCodes = {
  PROVIDER_ADAPTER_DEFAULTED: "COMPAT_PROVIDER_ADAPTER_DEFAULTED",
  PROVIDER_SELECTION_DEFAULTED: "COMPAT_PROVIDER_SELECTION_DEFAULTED",
  MODEL_SELECTION_DEFAULTED: "COMPAT_MODEL_SELECTION_DEFAULTED",
} as const;

export type CompatFallbackReason =
  (typeof CompatFallbackReasonCodes)[keyof typeof CompatFallbackReasonCodes];

/**
 * Structured fallback event for logging
 */
export interface CompatFallbackEvent {
  reasonCode: CompatFallbackReason;
  requestedProvider?: string;
  resolvedProvider: string;
  requestedModel?: string;
  resolvedModel: string;
  runId?: string;
}

/**
 * Log a compat mode fallback with structured fields
 */
export function logCompatFallback(event: CompatFallbackEvent): void {
  console.warn(
    `[brain/compat-fallback] ${event.reasonCode}`,
    {
      requestedProvider: event.requestedProvider,
      resolvedProvider: event.resolvedProvider,
      requestedModel: event.requestedModel,
      resolvedModel: event.resolvedModel,
      runId: event.runId,
    },
  );
}
