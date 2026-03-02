/**
 * Runtime ports - Canonical boundary contracts for Brain orchestration.
 *
 * These ports implement the portability boundary architecture from:
 * - Charter 46: Product Architecture Charter
 * - Plan 59: Runtime Decompose/Decouple HLD
 * - PORTABILITY-BOUNDARY-DECOUPLING-PLAN
 */

export type { ExecutionSandboxPort, RunOrchestratorPort, ExecutionRuntimePort } from "./ExecutionRuntimePort";
export type { ProviderAuthPort, ModelProviderPort, ProviderResolutionPort } from "./ProviderResolutionPort";
export type { StreamEvent, RealtimeEventPort } from "./EventStreamPort";
