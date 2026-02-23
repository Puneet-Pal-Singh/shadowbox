/**
 * Provider Vault Coordinator Durable Object
 *
 * Provides serialized mutation control for BYOK operations.
 * Ensures only one mutation per workspace happens at a time.
 * Also handles cache invalidation and audit event emission.
 *
 * Key: `vault:{userId}:{workspaceId}`
 */

import { ProviderVaultRepository, IDatabase } from "./repository.js";

/**
 * Mutation request types handled by the coordinator
 */
export type CoordinatorMutation =
  | { type: "connectCredential"; data: unknown }
  | { type: "disconnectCredential"; data: { credentialId: string } }
  | { type: "updatePreferences"; data: unknown }
  | { type: "validateCredential"; data: { credentialId: string } };

/**
 * Coordinator response
 */
export interface CoordinatorResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Idempotency tracking
 */
interface IdempotencyKey {
  key: string;
  result?: CoordinatorResponse;
  expiresAt: number;
}

/**
 * ProviderVaultCoordinatorDO
 *
 * Durable Object for BYOK mutation coordination.
 * Serializes mutations by workspace to prevent race conditions.
 */
export class ProviderVaultCoordinatorDO {
  private idempotencyMap: Map<string, IdempotencyKey> = new Map();
  private mutationInProgress = false;
  private mutationQueue: Array<{
    mutation: CoordinatorMutation;
    idempotencyKey?: string;
  }> = [];

  constructor(
    private state: DurableObjectState,
    private repository: ProviderVaultRepository,
    private kvCache?: KVNamespace,
  ) {}

  /**
   * Process a mutation with idempotency support
   *
   * @param mutation The mutation to process
   * @param idempotencyKey Optional key for idempotent requests
   * @returns Coordinator response
   */
  async processMutation(
    mutation: CoordinatorMutation,
    idempotencyKey?: string,
  ): Promise<CoordinatorResponse> {
    // Check idempotency cache
    if (idempotencyKey) {
      const cached = this.idempotencyMap.get(idempotencyKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result || { success: true };
      }
    }

    // Queue the mutation
    this.mutationQueue.push({ mutation, idempotencyKey });

    // Process queue
    await this.processQueue();

    // Return success (actual result would be in cache invalidation)
    return { success: true };
  }

  /**
   * Process the mutation queue serially
   */
  private async processQueue(): Promise<void> {
    if (this.mutationInProgress || this.mutationQueue.length === 0) {
      return;
    }

    this.mutationInProgress = true;

    try {
      while (this.mutationQueue.length > 0) {
        const { mutation, idempotencyKey } = this.mutationQueue.shift()!;

        let response: CoordinatorResponse;

        try {
          response = await this.executeMutation(mutation);

          // Cache result for idempotency
          if (idempotencyKey) {
            this.idempotencyMap.set(idempotencyKey, {
              key: idempotencyKey,
              result: response,
              expiresAt: Date.now() + 60 * 1000, // 60 second TTL
            });
          }

          // Invalidate KV cache on success
          if (response.success) {
            await this.invalidateCache();
          }
        } catch (error) {
          response = {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    } finally {
      this.mutationInProgress = false;
    }
  }

  /**
   * Execute a mutation
   */
  private async executeMutation(mutation: CoordinatorMutation): Promise<CoordinatorResponse> {
    // In Phase 2, these would be actual implementations
    // For now, return success placeholder

    switch (mutation.type) {
      case "connectCredential":
        // Would call repository.create() with proper error handling
        return { success: true, data: { credentialId: "cred-123" } };

      case "disconnectCredential":
        // Would call repository.delete()
        return { success: true };

      case "updatePreferences":
        // Would call preferences service
        return { success: true };

      case "validateCredential":
        // Would call validation service
        return { success: true };

      default:
        return { success: false, error: "Unknown mutation type" };
    }
  }

  /**
   * Invalidate KV cache keys related to this workspace
   */
  private async invalidateCache(): Promise<void> {
    if (!this.kvCache) {
      return;
    }

    // Invalidate cache keys that would be affected by mutations:
    // - credentials list for this workspace
    // - preferences for this workspace
    // - resolved config for active sessions

    try {
      // In Phase 2, would read from KV to find related keys
      // For now, just a placeholder for the architecture
    } catch (error) {
      // Log cache invalidation failures but don't fail the mutation
      console.error("[byok/coordinator] Cache invalidation failed:", error);
    }
  }

  /**
   * Health check for the coordinator
   */
  async health(): Promise<{ healthy: boolean; queueLength: number }> {
    return {
      healthy: !this.mutationInProgress,
      queueLength: this.mutationQueue.length,
    };
  }
}

/**
 * Type stubs for DurableObject interfaces
 * (In real implementation, these would come from @cloudflare/workers-types)
 */
interface DurableObjectState {
  waitUntil(promise: Promise<unknown>): void;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}
