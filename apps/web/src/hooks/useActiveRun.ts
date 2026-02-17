/**
 * useActiveRun Hook
 *
 * Single Responsibility: Provide current active run ID within session context.
 * Ensures run ID tracks session switches correctly.
 *
 * This hook separates run-level operations from session-level management.
 * It's a thin wrapper that reads the active run from the current session.
 *
 * @module hooks/useActiveRun
 */

import { useMemo } from "react";
import type { AgentSession } from "../types/session";

/**
 * Get the active run ID from a session
 * Safe fallback to empty string if session is invalid
 */
export function useActiveRun(session: AgentSession | null): string {
  return useMemo(() => {
    if (!session) return "";
    if (!session.activeRunId) {
      console.warn("[useActiveRun] Session missing activeRunId:", session.id);
      return "";
    }
    return session.activeRunId;
  }, [session?.activeRunId, session?.id]);
}
