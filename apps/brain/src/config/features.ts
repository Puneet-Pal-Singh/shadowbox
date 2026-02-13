// apps/brain/src/config/features.ts
// Feature flags configuration for gradual rollout of Phase 3 RunEngine

export interface FeatureFlags {
  /**
   * Enable RunEngine-based orchestration for chat flows
   * - true: Use new Phase 3 RunEngine
   * - false: Use legacy StreamOrchestratorService
   */
  USE_RUN_ENGINE: boolean;

  /**
   * Percentage of traffic to route through RunEngine (0-100)
   * For gradual rollout
   */
  RUN_ENGINE_TRAFFIC_PERCENTAGE: number;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  USE_RUN_ENGINE: false, // Start false, enable gradually
  RUN_ENGINE_TRAFFIC_PERCENTAGE: 0,
};

/**
 * Environment variables interface for feature flags
 */
interface FeatureEnv {
  USE_RUN_ENGINE?: string;
  RUN_ENGINE_TRAFFIC_PERCENTAGE?: string;
}

/**
 * Get feature flags from environment or request context
 * Accepts any object that might contain feature flag properties
 */
export function getFeatureFlags(env?: Record<string, unknown>): FeatureFlags {
  const featureEnv = env as FeatureEnv | undefined;
  return {
    USE_RUN_ENGINE:
      featureEnv?.USE_RUN_ENGINE === "true" ||
      DEFAULT_FEATURE_FLAGS.USE_RUN_ENGINE,
    RUN_ENGINE_TRAFFIC_PERCENTAGE: parseInt(
      featureEnv?.RUN_ENGINE_TRAFFIC_PERCENTAGE || "0",
      10,
    ),
  };
}

/**
 * Check if RunEngine should be used for a specific agent
 * @param features - Feature flags configuration
 * @param agentId - Agent identifier
 * @returns boolean indicating if RunEngine should be used
 */
export function shouldUseRunEngine(
  features: FeatureFlags,
  agentId: string,
): boolean {
  // Always use RunEngine for specific agents (e.g., coding agents)
  const runEngineAgents = ["coding-agent", "review-agent", "planner-agent"];
  if (runEngineAgents.includes(agentId)) {
    return true;
  }

  // Use percentage-based routing for others
  if (features.RUN_ENGINE_TRAFFIC_PERCENTAGE >= 100) {
    return true;
  }

  if (features.RUN_ENGINE_TRAFFIC_PERCENTAGE <= 0) {
    return false;
  }

  // Hash-based routing for consistent experience
  const hash = simpleHash(agentId);
  return hash % 100 < features.RUN_ENGINE_TRAFFIC_PERCENTAGE;
}

/**
 * Simple hash function for consistent routing
 * @param str - String to hash
 * @returns Hash value
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
