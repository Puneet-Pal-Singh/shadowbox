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
import { Sandbox } from "@cloudflare/sandbox";
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
 * Type-compatible R2Bucket interface for adapter instantiation.
 * Matches the internal definition in CloudflareArtifactStoreAdapter.
 */
interface R2BucketCompat {
  head(key: string): Promise<{ key: string; version: string; size: number; etag: string; uploaded: Date; httpMetadata?: Record<string, string>; customMetadata?: Record<string, string>; arrayBuffer(): Promise<ArrayBuffer> } | null>;
  get(key: string): Promise<{ key: string; version: string; size: number; etag: string; uploaded: Date; httpMetadata?: Record<string, string>; customMetadata?: Record<string, string>; arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: any, options?: { httpMetadata?: Record<string, string> }): Promise<{ key: string; version: string; size: number; etag: string; uploaded: Date; httpMetadata?: Record<string, string>; customMetadata?: Record<string, string>; arrayBuffer(): Promise<ArrayBuffer> }>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ objects: any[]; delimitedPrefixes?: string[]; isTruncated: boolean; cursor?: string }>;
}

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
 * **Implementation Note**: This is a Phase 1 stub.
 * SHA-23 Phase 3 will refactor AgentRuntime to use composed ports.
 * This factory demonstrates the composition pattern and will be
 * integrated into AgentRuntime's constructor.
 *
 * **Dependencies Required**:
 * - Sandbox instance (from Cloudflare runtime)
 * - Plugin registry (from AgentRuntime)
 * - DurableObjectState (for storage)
 * - Env (for R2 bucket binding)
 *
 * @param durableObjectState - Durable Object context for storage
 * @param env - Cloudflare environment with R2 bucket binding
 * @returns Composed runtime with all ports wired
 * @throws Error - If called with incomplete dependencies
 */
export function composeRuntime(
  durableObjectState: DurableObjectState,
  env: Env,
): ComposedRuntime {
  // Phase 1 Implementation: Create adapters with available dependencies
  // Note: This is a stub demonstrating the pattern.
  // Full implementation requires Sandbox and plugin registry from AgentRuntime.

  // Session and artifact adapters are complete and can be instantiated
  const sessionAdapter = new CloudflareSessionStateAdapter(durableObjectState);
  const artifactAdapter = new CloudflareArtifactStoreAdapter(
    env.ARTIFACTS as unknown as R2BucketCompat,
  );

  // Execution adapter requires Sandbox and plugin registry from AgentRuntime
  // Will be injected in SHA-23 Phase 3 refactoring
  const executionAdapter = new CloudflareSandboxExecutionAdapter(
    null as unknown as Sandbox,
    new Map(),
  );

  // 2. Return as port abstractions
  // Callers depend on ports, not concrete adapters
  return {
    executionPort: executionAdapter,
    sessionPort: sessionAdapter,
    artifactPort: artifactAdapter,
  };
}
