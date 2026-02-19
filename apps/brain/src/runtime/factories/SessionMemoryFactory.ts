/**
 * SessionMemoryFactory - Build session memory client.
 *
 * Single Responsibility: Create and configure session memory client for runtime.
 * Handles Durable Object binding and fallback logic.
 */

import type { Env } from "../../types/ai";
import { SessionMemoryClient } from "../../services/memory/SessionMemoryClient";

/**
 * Build session memory client if binding is available.
 *
 * In production: logs warning if binding is unavailable and returns undefined.
 * In development: silently returns undefined if binding is unavailable.
 *
 * @param env - Cloudflare environment
 * @param sessionId - Session ID for client initialization
 * @returns SessionMemoryClient or undefined if binding unavailable
 */
export function buildSessionMemoryClient(
  env: Env,
  sessionId: string,
): SessionMemoryClient | undefined {
  if (!env.SESSION_MEMORY_RUNTIME) {
    // NODE_ENV may be undefined in Cloudflare Workers; treat as production for safety
    const isProduction = env.NODE_ENV !== "development" && env.NODE_ENV !== "test";
    if (isProduction) {
      console.warn(
        "[runtime/session-memory-factory] SESSION_MEMORY_RUNTIME binding is not configured. " +
          "Session memory will be disabled. This may cause unexpected behavior.",
      );
    }
    return undefined;
  }

  const sessionMemoryId = env.SESSION_MEMORY_RUNTIME.idFromName(sessionId);
  const sessionMemoryStub = env.SESSION_MEMORY_RUNTIME.get(sessionMemoryId);
  return new SessionMemoryClient({
    durableObjectId: sessionId,
    durableObjectStub: sessionMemoryStub as unknown as {
      fetch: (request: Request) => Promise<Response>;
    },
  });
}
