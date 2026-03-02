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
import type { Sandbox } from "@cloudflare/sandbox";
import type {
  SandboxExecutionPort,
  SessionStatePort,
  ArtifactStorePort,
} from "../ports";
import { AgentRuntimeAdapterFactory } from "../adapters/AgentRuntimeAdapterFactory";
import type { IPlugin } from "../interfaces/types";

/**
 * Type-compatible R2 bucket interface for artifact adapter composition.
 */
interface R2ObjectCompat {
  key: string;
  version: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: Record<string, string>;
  customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2BucketCompat {
  head(key: string): Promise<R2ObjectCompat | null>;
  get(key: string): Promise<R2ObjectCompat | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: Record<string, string> },
  ): Promise<R2ObjectCompat>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string }): Promise<{
    objects: R2ObjectCompat[];
    delimitedPrefixes?: string[];
    isTruncated: boolean;
    cursor?: string;
  }>;
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

export interface ComposeRuntimeInput {
  durableObjectState: DurableObjectState;
  sandbox: Sandbox;
  plugins: Map<string, IPlugin>;
  r2Bucket: R2BucketCompat;
}

/**
 * Compose complete runtime with port-based dependency injection.
 *
 * This factory wires all platform-specific adapters and returns
 * canonical runtime ports for orchestration usage.
 *
 * @param input - Composition inputs from AgentRuntime boundary
 * @returns Composed runtime with all ports wired
 */
export function composeRuntime(
  input: ComposeRuntimeInput,
): ComposedRuntime {
  const adapters = AgentRuntimeAdapterFactory.createAdapters({
    durableObjectState: input.durableObjectState,
    sandbox: input.sandbox,
    plugins: input.plugins,
    r2Bucket: input.r2Bucket,
  });

  return {
    executionPort: adapters.sandboxExecution,
    sessionPort: adapters.sessionState,
    artifactPort: adapters.artifactStore,
  };
}
