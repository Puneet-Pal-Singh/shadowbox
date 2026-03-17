/**
 * Provider Vault Coordinator Durable Object
 *
 * Provides serialized mutation control for BYOK operations.
 * Ensures only one mutation per user happens at a time.
 * Also handles cache invalidation and audit event emission.
 *
 * Key: `vault:{userId}`
 *
 * Credentials are user-scoped (not workspace-scoped) so the coordinator
 * serializes by user identity only.
 */

import { DurableObjectState } from "@cloudflare/workers-types";
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
 * Pending mutation tracking for promise-based result propagation
 */
interface PendingMutation {
  resolve: (response: CoordinatorResponse) => void;
  reject: (error: Error) => void;
  expiresAt: number;
}

/**
 * ProviderVaultCoordinatorDO
 *
 * Durable Object for BYOK mutation coordination.
 * Serializes mutations by user to prevent race conditions.
 */
export class ProviderVaultCoordinatorDO {
  private idempotencyMap: Map<string, IdempotencyKey> = new Map();
  private mutationInProgress = false;
  private mutationQueue: Array<{
    mutation: CoordinatorMutation;
    idempotencyKey?: string;
    id: symbol;
  }> = [];
  private pendingMutations: Map<symbol, PendingMutation> = new Map();

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

    // Create a promise that resolves when this specific mutation completes
    const mutationId = Symbol("mutation-id");
    const resultPromise = new Promise<CoordinatorResponse>((resolve, reject) => {
      this.pendingMutations.set(mutationId, {
        resolve,
        reject,
        expiresAt: Date.now() + 60 * 1000, // 60 second TTL
      });
    });

    // Queue the mutation
    this.mutationQueue.push({ mutation, idempotencyKey, id: mutationId });

    // Process queue (non-blocking)
    this.processQueue().catch(() => {
      // Errors are handled in processQueue, just ensure it runs
    });

    // Wait for this specific mutation to complete
    return resultPromise;
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
      // Evict expired idempotency and pending entries
      this.evictExpiredEntries();

      while (this.mutationQueue.length > 0) {
        const { mutation, idempotencyKey, id: mutationId } = this.mutationQueue.shift()!;

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

        // Resolve the promise for this specific mutation
        const pending = this.pendingMutations.get(mutationId);
        if (pending) {
          pending.resolve(response);
          this.pendingMutations.delete(mutationId);
        }
      }
    } finally {
      this.mutationInProgress = false;
    }
  }

  /**
   * Evict expired idempotency and pending mutation entries
   */
  private evictExpiredEntries(): void {
    const now = Date.now();

    // Evict expired idempotency keys
    for (const [key, entry] of this.idempotencyMap) {
      if (entry.expiresAt <= now) {
        this.idempotencyMap.delete(key);
      }
    }

    // Evict expired pending mutations
    for (const [id, pending] of this.pendingMutations) {
      if (pending.expiresAt <= now) {
        pending.reject(new Error("Mutation timeout"));
        this.pendingMutations.delete(id);
      }
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
 * KV Namespace interface for cache operations
 * (from @cloudflare/workers-types)
 */
interface KVNamespace {
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}
