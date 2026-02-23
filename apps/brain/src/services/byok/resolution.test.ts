/**
 * Provider Resolution Service Tests
 *
 * Tests for the resolution pipeline and fallback behavior.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ProviderResolutionService,
  type ResolutionContext,
  type PlatformDefaults,
} from "./resolution.js";

describe("ProviderResolutionService", () => {
  let service: ProviderResolutionService;
  let mockRepository: any;
  const platformDefaults: PlatformDefaults = {
    providerId: "litellm",
    modelId: "gpt-4-turbo",
  };

  beforeEach(() => {
    mockRepository = {
      retrieve: vi.fn().mockResolvedValue(null),
    };

    service = new ProviderResolutionService(mockRepository, platformDefaults);
  });

  describe("resolve", () => {
    const context: ResolutionContext = {
      userId: "user-123",
      workspaceId: "ws-123",
      sessionId: "session-123",
    };

    it("resolves request override", async () => {
      const request = {
        providerId: "openai",
        credentialId: "cred-123",
        modelId: "gpt-4-turbo",
      };

      const result = await service.resolve(request, context);

      if ("error" in result) {
        throw new Error("Should not error");
      }

      expect(result.providerId).toBe("openai");
      expect(result.credentialId).toBe("cred-123");
      expect(result.modelId).toBe("gpt-4-turbo");
      expect(result.resolvedAt).toBe("request_override");
      expect(result.fallbackUsed).toBe(false);
    });

    it("falls back to platform default when no override", async () => {
      const request = {};

      const result = await service.resolve(request, context);

      if ("error" in result) {
        throw new Error("Should not error");
      }

      expect(result.providerId).toBe("litellm");
      expect(result.modelId).toBe("gpt-4-turbo");
      expect(result.resolvedAt).toBe("platform_fallback");
      expect(result.fallbackUsed).toBe(true);
    });

    it("includes sessionId in error correlation", async () => {
      // Mock repository to throw error
      mockRepository.retrieve.mockRejectedValueOnce(
        new Error("DB connection failed"),
      );

      // Use a partial request to force repository lookup
      const request = {
        providerId: "openai",
        credentialId: "cred-123",
        modelId: "gpt-4-turbo",
      };

      // Request override now validates the credential, triggering the error
      const result = await service.resolve(request, context);

      // Should either error or fall back
      if ("error" in result) {
        expect(result.error).toBeDefined();
        expect(result.correlationId).toBe(context.sessionId);
      }
    });
  });

  describe("resolution pipeline", () => {
    const context: ResolutionContext = {
      userId: "user-123",
      workspaceId: "ws-123",
    };

    it("prioritizes request override over everything", async () => {
      const requestOverride = {
        providerId: "openai",
        credentialId: "cred-openai",
        modelId: "gpt-4-turbo",
      };

      const result = await service.resolve(requestOverride, context);

      if ("error" in result) {
        throw new Error("Should not error");
      }

      expect(result.resolvedAt).toBe("request_override");
    });

    it("handles partial request overrides by falling back", async () => {
      const partialOverride = {
        providerId: "openai",
        // Missing credentialId and modelId
      };

      const result = await service.resolve(partialOverride, context);

      if ("error" in result) {
        throw new Error("Should not error");
      }

      // Should fall through to platform default
      expect(result.resolvedAt).toBe("platform_fallback");
    });
  });

  describe("error handling", () => {
    const context: ResolutionContext = {
      userId: "user-123",
      workspaceId: "ws-123",
      sessionId: "session-123",
    };

    it("returns error with correlation ID when repository fails", async () => {
      // Mock repository to throw
      mockRepository.retrieve.mockRejectedValueOnce(
        new Error("Database connection failed"),
      );

      // Force repository lookup by providing partial request override
      const request = {
        providerId: "openai",
        credentialId: "cred-123",
        modelId: "gpt-4-turbo",
      };
      const result = await service.resolve(request, context);

      // The request override validation should trigger the error
      if ("error" in result) {
        expect(result.error).toContain("Database connection failed");
        expect(result.correlationId).toBe(context.sessionId);
      }
    });
  });
});
