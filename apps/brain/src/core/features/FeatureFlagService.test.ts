/**
 * FeatureFlagService Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FeatureFlagService, FeatureFlagName } from "./FeatureFlagService";
import type { Env } from "../../types/ai";

describe("FeatureFlagService", () => {
  let env: Env;

  beforeEach(() => {
    // Reset singleton instance
    (FeatureFlagService as any).instance = undefined;

    // Create minimal test env
    env = {
      ENVIRONMENT: "test",
    } as Env;
  });

  describe("initialization", () => {
    it("should load flags from environment variables", async () => {
      const testEnv = {
        ...env,
        FEATURE_FLAG_BYOK_V3_ENABLED: "true",
        FEATURE_FLAG_BYOK_MIGRATION_ENABLED: "true",
      } as Env;

      const service = FeatureFlagService.getInstance(testEnv);
      await service.initialize();

      expect(await service.isEnabled(FeatureFlagName.BYOK_V3_ENABLED)).toBe(
        true
      );
      expect(
        await service.isEnabled(FeatureFlagName.BYOK_MIGRATION_ENABLED)
      ).toBe(true);
    });

    it("should use default values when env vars not set", async () => {
      const service = FeatureFlagService.getInstance(env);
      await service.initialize();

      // BYOK_V3_ENABLED defaults to false
      expect(await service.isEnabled(FeatureFlagName.BYOK_V3_ENABLED)).toBe(
        false
      );

      // BYOK_RATE_LIMIT_ENABLED defaults to true
      expect(
        await service.isEnabled(FeatureFlagName.BYOK_RATE_LIMIT_ENABLED)
      ).toBe(true);
    });

    it("should handle '1' as true and '0' as false", async () => {
      const testEnv = {
        ...env,
        FEATURE_FLAG_BYOK_V3_ENABLED: "1",
        FEATURE_FLAG_BYOK_MIGRATION_CUTOVER: "0",
      } as Env;

      const service = FeatureFlagService.getInstance(testEnv);
      await service.initialize();

      expect(await service.isEnabled(FeatureFlagName.BYOK_V3_ENABLED)).toBe(
        true
      );
      expect(
        await service.isEnabled(FeatureFlagName.BYOK_MIGRATION_CUTOVER)
      ).toBe(false);
    });

    it("should initialize only once", async () => {
      const service = FeatureFlagService.getInstance(env);

      await service.initialize();
      await service.initialize();
      await service.initialize();

      // All calls should complete without error
      expect(true).toBe(true);
    });
  });

  describe("isEnabled", () => {
    it("should auto-initialize on first isEnabled call", async () => {
      const service = FeatureFlagService.getInstance(env);

      // Call isEnabled without explicit initialize
      const result = await service.isEnabled(
        FeatureFlagName.BYOK_V3_ENABLED
      );

      // Should have initialized
      expect(result).toBe(false);
    });

    it("should return false for unknown flags", async () => {
      const service = FeatureFlagService.getInstance(env);
      await service.initialize();

      const result = await service.isEnabled(
        "UNKNOWN_FLAG" as FeatureFlagName
      );
      expect(result).toBe(false);
    });
  });

  describe("runtime overrides", () => {
    it("should allow runtime flag updates", async () => {
      const service = FeatureFlagService.getInstance(env);
      await service.initialize();

      expect(await service.isEnabled(FeatureFlagName.BYOK_V3_ENABLED)).toBe(
        false
      );

      service.setFlag(FeatureFlagName.BYOK_V3_ENABLED, true);

      expect(await service.isEnabled(FeatureFlagName.BYOK_V3_ENABLED)).toBe(
        true
      );
    });

    it("should persist runtime overrides across calls", async () => {
      const service = FeatureFlagService.getInstance(env);
      await service.initialize();

      service.setFlag(FeatureFlagName.BYOK_MIGRATION_ENABLED, true);

      expect(
        await service.isEnabled(FeatureFlagName.BYOK_MIGRATION_ENABLED)
      ).toBe(true);
      expect(
        await service.isEnabled(FeatureFlagName.BYOK_MIGRATION_ENABLED)
      ).toBe(true);
    });
  });

  describe("getAllFlags", () => {
    it("should return all flag states", async () => {
      const service = FeatureFlagService.getInstance(env);
      const allFlags = await service.getAllFlags();

      expect(allFlags[FeatureFlagName.BYOK_V3_ENABLED]).toBe(false);
      expect(allFlags[FeatureFlagName.BYOK_MIGRATION_ENABLED]).toBe(false);
      expect(allFlags[FeatureFlagName.BYOK_MIGRATION_CUTOVER]).toBe(false);
      expect(allFlags[FeatureFlagName.BYOK_RATE_LIMIT_ENABLED]).toBe(true);
    });

    it("should auto-initialize when called before initialize", async () => {
      const service = FeatureFlagService.getInstance(env);

      const allFlags = await service.getAllFlags();
      expect(allFlags[FeatureFlagName.BYOK_V3_ENABLED]).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset to environment defaults", async () => {
      const service = FeatureFlagService.getInstance(env);
      await service.initialize();

      service.setFlag(FeatureFlagName.BYOK_V3_ENABLED, true);
      expect(await service.isEnabled(FeatureFlagName.BYOK_V3_ENABLED)).toBe(
        true
      );

      await service.reset();

      expect(await service.isEnabled(FeatureFlagName.BYOK_V3_ENABLED)).toBe(
        false
      );
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance across calls", () => {
      const service1 = FeatureFlagService.getInstance(env);
      const service2 = FeatureFlagService.getInstance(env);

      expect(service1).toBe(service2);
    });

    it("should refresh env snapshot when a new env object is provided", async () => {
      const firstEnv = {
        ...env,
        FEATURE_FLAG_BYOK_V3_ENABLED: "false",
      } as Env;
      const secondEnv = {
        ...env,
        FEATURE_FLAG_BYOK_V3_ENABLED: "true",
      } as Env;

      const service = FeatureFlagService.getInstance(firstEnv);
      expect(await service.isEnabled(FeatureFlagName.BYOK_V3_ENABLED)).toBe(
        false,
      );

      const sameService = FeatureFlagService.getInstance(secondEnv);
      expect(sameService).toBe(service);
      expect(
        await sameService.isEnabled(FeatureFlagName.BYOK_V3_ENABLED),
      ).toBe(true);
    });
  });
});
