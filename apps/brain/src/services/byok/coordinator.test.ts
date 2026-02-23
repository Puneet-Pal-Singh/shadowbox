/**
 * Provider Vault Coordinator Tests
 *
 * Tests for mutation coordination and idempotency.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ProviderVaultCoordinatorDO,
  type CoordinatorMutation,
} from "./coordinator.js";

describe("ProviderVaultCoordinatorDO", () => {
  let coordinator: ProviderVaultCoordinatorDO;
  let mockState: any;
  let mockRepository: any;

  beforeEach(() => {
    mockState = {
      waitUntil: vi.fn(),
      blockConcurrencyWhile: vi.fn((fn) => fn()),
    };

    mockRepository = {
      create: vi.fn(),
      delete: vi.fn(),
    };

    coordinator = new ProviderVaultCoordinatorDO(
      mockState,
      mockRepository,
      undefined,
    );
  });

  describe("processMutation", () => {
    it("processes connectCredential mutation", async () => {
      const mutation: CoordinatorMutation = {
        type: "connectCredential",
        data: { providerId: "openai" },
      };

      const response = await coordinator.processMutation(mutation);

      expect(response.success).toBe(true);
      // Data would be populated in cache/events, not in direct response
    });

    it("processes disconnectCredential mutation", async () => {
      const mutation: CoordinatorMutation = {
        type: "disconnectCredential",
        data: { credentialId: "cred-123" },
      };

      const response = await coordinator.processMutation(mutation);

      expect(response.success).toBe(true);
    });

    it("supports idempotency keys and returns cached result on duplicate", async () => {
      const mutation: CoordinatorMutation = {
        type: "connectCredential",
        data: { providerId: "openai" },
      };

      const idempotencyKey = "idempotency-123";

      const response1 = await coordinator.processMutation(
        mutation,
        idempotencyKey,
      );
      const response2 = await coordinator.processMutation(
        mutation,
        idempotencyKey,
      );

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
      // Both should return the same cached result
      expect(response1).toEqual(response2);
    });

    it("processes duplicate mutations independently without idempotency key", async () => {
      const mutation: CoordinatorMutation = {
        type: "connectCredential",
        data: { providerId: "openai" },
      };

      const response1 = await coordinator.processMutation(mutation);
      const response2 = await coordinator.processMutation(mutation);

      // Both should succeed (queued and processed independently)
      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
    });

    it("returns error for unknown mutation types", async () => {
      const mutation = {
        type: "unknownType",
        data: {},
      } as CoordinatorMutation;

      // Coordinator should queue and attempt processing
      // Unknown types return an error response
      const response = await coordinator.processMutation(mutation);

      // Should propagate the actual error from executeMutation
      expect(response.success).toBe(false);
      expect(response.error).toBe("Unknown mutation type");
    });
  });

  describe("health", () => {
    it("reports healthy when not processing", async () => {
      const health = await coordinator.health();

      expect(health.healthy).toBe(true);
      expect(health.queueLength).toBe(0);
    });
  });

  describe("mutation serialization", () => {
    it("queues mutations when one is in progress", async () => {
      const mutation1: CoordinatorMutation = {
        type: "connectCredential",
        data: { providerId: "openai" },
      };
      const mutation2: CoordinatorMutation = {
        type: "disconnectCredential",
        data: { credentialId: "cred-123" },
      };

      // Both mutations should be queued and processed serially
      await Promise.all([
        coordinator.processMutation(mutation1),
        coordinator.processMutation(mutation2),
      ]);

      // Both should succeed
      const health = await coordinator.health();
      expect(health.healthy).toBe(true);
    });
  });
});
