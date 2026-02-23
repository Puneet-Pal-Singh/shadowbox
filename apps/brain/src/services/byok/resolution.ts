/**
 * Provider Resolution Service
 *
 * Resolves the effective provider configuration for a request.
 * Implements the resolution pipeline:
 * 1. Request override
 * 2. Session preference
 * 3. Workspace preference
 * 4. Platform fallback
 *
 * Also handles fallback chain (strict vs allow_fallback mode).
 */

import {
  BYOKResolution,
  BYOKResolveRequest,
  BYOKError,
  createBYOKError,
} from "@repo/shared-types";
import { ProviderVaultRepository } from "./repository.js";

/**
 * Resolution context (what we know about the request)
 */
export interface ResolutionContext {
  userId: string;
  workspaceId: string;
  sessionId?: string;
}

/**
 * Platform defaults (fallback when no BYOK selection)
 */
export interface PlatformDefaults {
  providerId: string;
  modelId: string;
}

/**
 * Workspace preferences (Phase 2 placeholder)
 *
 * Defines user/workspace-level provider preferences and fallback behavior.
 */
export interface WorkspacePreferences {
  defaultProviderId?: string;
  defaultCredentialId?: string;
  defaultModelId?: string;
  fallbackMode?: "strict" | "allow_fallback";
  fallbackChain?: string[];
}

/**
 * ProviderResolutionService
 *
 * Resolves effective provider configuration through a prioritized pipeline.
 */
export class ProviderResolutionService {
  constructor(
    private repository: ProviderVaultRepository,
    private platformDefaults: PlatformDefaults,
  ) {}

  /**
   * Resolve provider configuration
   *
   * @param request Request overrides
   * @param context Request context
   * @returns Resolved configuration or error
   */
  async resolve(
    request: BYOKResolveRequest,
    context: ResolutionContext,
  ): Promise<BYOKResolution | BYOKError> {
    try {
      // Step 1: Check request overrides
      const requestOverride = await this.resolveFromRequestOverride(request);
      if (requestOverride) {
        return requestOverride;
      }

      // Step 2: Check workspace preferences
      const preferences = await this.loadPreferences(context);
      const workspaceResolution = await this.resolveFromWorkspacePreference(
        preferences,
      );
      if (workspaceResolution) {
        return workspaceResolution;
      }

      // Step 3: Try fallback chain if enabled
      if (preferences?.fallbackMode === "allow_fallback") {
        const fallbackResult = await this.tryFallbackChain(
          preferences,
          context,
        );

        if (fallbackResult) {
          return {
            ...fallbackResult,
            fallbackUsed: true,
          };
        }
      }

      // Step 4: Platform fallback
      return this.resolvePlatformFallback();
    } catch (error) {
      return createBYOKError(
        "RESOLUTION_FAILED",
        error instanceof Error ? error.message : "Failed to resolve provider",
        { correlationId: context.sessionId },
      );
    }
  }

  /**
   * Step 1: Resolve from request overrides with credential validation
   */
  private async resolveFromRequestOverride(
    request: BYOKResolveRequest,
  ): Promise<BYOKResolution | null> {
    if (!request.providerId || !request.credentialId || !request.modelId) {
      return null;
    }

    // Validate credential exists and is connected
    const credential = await this.repository.retrieve(request.credentialId);
    if (!credential || credential.status !== "connected") {
      return null; // Fall through to next step
    }

    return {
      providerId: request.providerId,
      credentialId: request.credentialId,
      modelId: request.modelId,
      resolvedAt: "request_override",
      resolvedAtTime: new Date().toISOString(),
      fallbackUsed: false,
    };
  }

  /**
   * Step 2: Resolve from workspace preferences
   */
  private async resolveFromWorkspacePreference(
    preferences: WorkspacePreferences | null,
  ): Promise<BYOKResolution | null> {
    if (
      !preferences?.defaultProviderId ||
      !preferences.defaultCredentialId ||
      !preferences.defaultModelId
    ) {
      return null;
    }

    // Validate credential exists and is active
    const credential = await this.repository.retrieve(
      preferences.defaultCredentialId,
    );

    if (!credential || credential.status !== "connected") {
      return null;
    }

    return {
      providerId: preferences.defaultProviderId,
      credentialId: preferences.defaultCredentialId,
      modelId: preferences.defaultModelId,
      resolvedAt: "workspace_preference",
      resolvedAtTime: new Date().toISOString(),
      fallbackUsed: false,
    };
  }

  /**
   * Step 4: Platform fallback
   */
  private resolvePlatformFallback(): BYOKResolution {
    return {
      providerId: this.platformDefaults.providerId,
      credentialId: "", // No credential for platform default
      modelId: this.platformDefaults.modelId,
      resolvedAt: "platform_fallback",
      resolvedAtTime: new Date().toISOString(),
      fallbackUsed: true,
    };
  }

  /**
   * Step 3: Try fallback chain in order
   */
  private async tryFallbackChain(
    preferences: WorkspacePreferences,
    context: ResolutionContext,
  ): Promise<Omit<BYOKResolution, "fallbackUsed"> | null> {
    const fallbackChain = preferences?.fallbackChain || [];

    for (const providerId of fallbackChain) {
      // In Phase 2, would:
      // 1. Get credentials for this provider
      // 2. Try to validate
      // 3. Return first working one

      // Placeholder: skip implementation until Phase 2
    }

    return null; // No fallback available
  }

  /**
   * Load workspace preferences
   */
  private async loadPreferences(
    context: ResolutionContext,
  ): Promise<WorkspacePreferences | null> {
    // In Phase 2, would load from preferences table
    // For now, return null to fall through to platform default
    return null;
  }
}
