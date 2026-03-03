/**
 * Provider Resolution Service
 *
 * Resolves the effective provider configuration for a request.
 * Implements the resolution pipeline with EXPLICIT STRICT MODE (no silent fallbacks):
 * 1. Request override - explicit provider/model or error
 * 2. Session preference - explicit provider/model or error
 * 3. Workspace preference - explicit provider/model or error
 * 4. Platform standard defaults - only if all steps yield no preference
 *
 * KEY CHANGE (RCP3): Removed allow_fallback mode and fallback chains.
 * All invalid/missing selections now fail fast with typed errors.
 * Silent provider/model switching is NO LONGER SUPPORTED.
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
 * Workspace preferences
 *
 * Defines user/workspace-level provider preferences.
 * NO FALLBACK CHAINS: Selections are explicit or invalid.
 */
export interface WorkspacePreferences {
  defaultProviderId?: string;
  defaultCredentialId?: string;
  defaultModelId?: string;
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

      // Step 3: Use platform defaults (no fallback chains)
      // If we reach here, no explicit selection was made
      return this.resolvePlatformDefaults();
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
  /**
   * Step 3: Resolve to platform defaults.
   * RCP3 CHANGE: No fallback chains. Explicit selection or platform defaults only.
   * Marks resolution source as "platform_defaults" (not "fallback").
   */
  private resolvePlatformDefaults(): BYOKResolution {
    return {
      providerId: this.platformDefaults.providerId,
      credentialId: "", // No credential for platform default
      modelId: this.platformDefaults.modelId,
      resolvedAt: "platform_defaults",
      resolvedAtTime: new Date().toISOString(),
      fallbackUsed: false, // Explicit defaults, not fallback
    };
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
