/**
 * Feature Flag Service
 *
 * Centralized feature flag management for gradual rollout and A/B testing.
 * Supports environment-based config and Durable Object storage for dynamic updates.
 *
 * Usage:
 *   const flags = FeatureFlagService.getInstance(env);
 *   if (await flags.isEnabled('BYOK_V3_ENABLED')) { ... }
 */

import type { Env } from "../../types/ai";

/**
 * Feature flag names
 */
export enum FeatureFlagName {
  BYOK_V3_ENABLED = "BYOK_V3_ENABLED",
  BYOK_MIGRATION_ENABLED = "BYOK_MIGRATION_ENABLED",
  BYOK_MIGRATION_CUTOVER = "BYOK_MIGRATION_CUTOVER",
  BYOK_RATE_LIMIT_ENABLED = "BYOK_RATE_LIMIT_ENABLED",
  // Track 2: Event Envelope Streaming
  CHAT_EVENT_STREAM_V1 = "CHAT_EVENT_STREAM_V1",
  CHAT_AGENTIC_LOOP_V1 = "CHAT_AGENTIC_LOOP_V1",
  CHAT_REVIEWER_PASS_V1 = "CHAT_REVIEWER_PASS_V1",
}

/**
 * Feature flag definition with defaults
 */
interface FeatureFlagDef {
  name: FeatureFlagName;
  description: string;
  defaultValue: boolean;
  envVarName: string;
}

const FLAG_DEFINITIONS: Record<FeatureFlagName, FeatureFlagDef> = {
  [FeatureFlagName.BYOK_V3_ENABLED]: {
    name: FeatureFlagName.BYOK_V3_ENABLED,
    description: "Enable BYOK v3 infrastructure",
    defaultValue: false,
    envVarName: "FEATURE_FLAG_BYOK_V3_ENABLED",
  },
  [FeatureFlagName.BYOK_MIGRATION_ENABLED]: {
    name: FeatureFlagName.BYOK_MIGRATION_ENABLED,
    description: "Enable background v2→v3 migration",
    defaultValue: false,
    envVarName: "FEATURE_FLAG_BYOK_MIGRATION_ENABLED",
  },
  [FeatureFlagName.BYOK_MIGRATION_CUTOVER]: {
    name: FeatureFlagName.BYOK_MIGRATION_CUTOVER,
    description: "Cutover to v3 only (no v2 fallback)",
    defaultValue: false,
    envVarName: "FEATURE_FLAG_BYOK_MIGRATION_CUTOVER",
  },
  [FeatureFlagName.BYOK_RATE_LIMIT_ENABLED]: {
    name: FeatureFlagName.BYOK_RATE_LIMIT_ENABLED,
    description: "Enable BYOK operation rate limiting",
    defaultValue: true,
    envVarName: "FEATURE_FLAG_BYOK_RATE_LIMIT_ENABLED",
  },
  // Track 2: Event Envelope Streaming
  [FeatureFlagName.CHAT_EVENT_STREAM_V1]: {
    name: FeatureFlagName.CHAT_EVENT_STREAM_V1,
    description: "Enable NDJSON event stream for chat responses",
    defaultValue: false,
    envVarName: "FEATURE_FLAG_CHAT_EVENT_STREAM_V1",
  },
  [FeatureFlagName.CHAT_AGENTIC_LOOP_V1]: {
    name: FeatureFlagName.CHAT_AGENTIC_LOOP_V1,
    description: "Enable bounded agentic loop for tool chaining",
    defaultValue: false,
    envVarName: "FEATURE_FLAG_CHAT_AGENTIC_LOOP_V1",
  },
  [FeatureFlagName.CHAT_REVIEWER_PASS_V1]: {
    name: FeatureFlagName.CHAT_REVIEWER_PASS_V1,
    description: "Enable generator->reviewer pass for synthesis",
    defaultValue: false,
    envVarName: "FEATURE_FLAG_CHAT_REVIEWER_PASS_V1",
  },
};

/**
 * FeatureFlagService - Manages feature flags with environment and DO backing
 */
export class FeatureFlagService {
  private static instance: FeatureFlagService;
  private flags: Map<FeatureFlagName, boolean> = new Map();
  private env: Env;
  private initialized = false;

  private constructor(env: Env) {
    this.env = env;
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(env: Env): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService(env);
      return FeatureFlagService.instance;
    }

    FeatureFlagService.instance.refreshEnv(env);
    return FeatureFlagService.instance;
  }

  /**
   * Initialize flags from environment
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    for (const flagDef of Object.values(FLAG_DEFINITIONS)) {
      const envValue = this.env[flagDef.envVarName as keyof Env];
      const isEnabled =
        envValue !== undefined
          ? envValue === "true" || envValue === "1"
          : flagDef.defaultValue;

      this.flags.set(flagDef.name, isEnabled);

      console.log(
        `[FeatureFlagService] Initialized ${flagDef.name}: ${isEnabled} (from ${envValue !== undefined ? "env" : "default"})`,
      );
    }

    this.initialized = true;
  }

  /**
   * Check if a feature flag is enabled
   */
  async isEnabled(flagName: FeatureFlagName): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    const value = this.flags.get(flagName);
    if (value === undefined) {
      console.warn(
        `[FeatureFlagService] Unknown flag: ${flagName}, defaulting to false`,
      );
      return false;
    }

    return value;
  }

  /**
   * Set flag value (runtime override)
   */
  setFlag(flagName: FeatureFlagName, value: boolean): void {
    this.flags.set(flagName, value);
    console.log(
      `[FeatureFlagService] Runtime override: ${flagName} = ${value}`,
    );
  }

  /**
   * Get all flag states
   */
  async getAllFlags(): Promise<Record<FeatureFlagName, boolean>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result: Record<string, boolean> = {};
    for (const [name, value] of this.flags.entries()) {
      result[name] = value;
    }
    return result as Record<FeatureFlagName, boolean>;
  }

  /**
   * Reset to environment defaults
   */
  async reset(): Promise<void> {
    this.flags.clear();
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Refresh request-scoped env bindings.
   * Cloudflare isolates can outlive a single request; this prevents stale env snapshots.
   */
  private refreshEnv(env: Env): void {
    if (this.env === env) {
      return;
    }

    this.env = env;
    this.flags.clear();
    this.initialized = false;
  }
}
