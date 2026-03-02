/**
 * Secure Agent API ports - Canonical boundary contracts for execution.
 *
 * These ports implement the portability boundary architecture from:
 * - Charter 46: Product Architecture Charter
 * - Plan 59: Runtime Decompose/Decouple HLD
 * - PORTABILITY-BOUNDARY-DECOUPLING-PLAN
 */

// Port type exports
export type { SandboxExecutionPort, TaskExecutionInput, TaskExecutionResult } from "./SandboxExecutionPort";
export type {
  SessionStatePort,
  SessionState,
  SessionSnapshot,
} from "./SessionStatePort";
export type {
  ArtifactStorePort,
  ArtifactMetadata,
  ArtifactUploadInput,
} from "./ArtifactStorePort";
