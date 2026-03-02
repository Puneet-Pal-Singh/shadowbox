/**
 * RuntimeCompositionFactory - Compose runtime orchestration from ports.
 *
 * Wires together all port implementations (adapters) to create a complete
 * execution runtime. Replaces direct Cloudflare dependencies with port-based
 * injection, enabling testability and platform portability.
 *
 * Aligns to:
 * - Charter 46: Canonical port mapping
 * - Plan 59: Runtime Decompose/Decouple HLD
 * - SHA-24: End-to-End Wiring & Conformance Gate
 */

import type { DurableObjectState } from "@cloudflare/workers-types";
import type {
  SandboxExecutionPort,
  SessionStatePort,
  ArtifactStorePort,
} from "../ports";
import { CloudflareSandboxExecutionAdapter } from "../adapters/CloudflareSandboxExecutionAdapter";
import { CloudflareSessionStateAdapter } from "../adapters/CloudflareSessionStateAdapter";
import { CloudflareArtifactStoreAdapter } from "../adapters/CloudflareArtifactStoreAdapter";
import type { Env } from "../index";

/**
 * Composed runtime dependencies.
 * All dependencies are port abstractions, not concrete implementations.
 */
export interface ComposedRuntime {
  executionPort: SandboxExecutionPort;
  sessionPort: SessionStatePort;
  artifactPort: ArtifactStorePort;
}

/**
 * Compose complete runtime with port-based dependency injection.
 *
 * This factory:
 * 1. Creates Cloudflare-backed adapter instances
 * 2. Wires them to implement port contracts
 * 3. Returns abstract port interfaces
 *
 * The result is a runtime that depends on ports, not Cloudflare primitives.
 *
 * @param durableObjectState - Durable Object context for storage
 * @param env - Cloudflare environment with R2 bucket binding
 * @returns Composed runtime with all ports wired
 */
export function composeRuntime(
  durableObjectState: DurableObjectState,
  env: Env,
): ComposedRuntime {
  // 1. Create adapters (Cloudflare-backed implementations)
  const executionAdapter = new CloudflareSandboxExecutionAdapter(
    durableObjectState,
    env,
  );
  const sessionAdapter = new CloudflareSessionStateAdapter(durableObjectState);
  const artifactAdapter = new CloudflareArtifactStoreAdapter(env.ARTIFACTS);

  // 2. Return as port abstractions
  // Callers depend on ports, not concrete adapters
  return {
    executionPort: executionAdapter,
    sessionPort: sessionAdapter,
    artifactPort: artifactAdapter,
  };
}
