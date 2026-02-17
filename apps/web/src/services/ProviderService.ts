/**
 * ProviderService
 * Client-side service for provider management.
 * Now delegates API operations to backend via ProviderApiClient.
 * Handles session-level model selection in browser storage only.
 */

import type {
  ProviderId,
  ConnectProviderRequest,
  ConnectProviderResponse,
  DisconnectProviderRequest,
  DisconnectProviderResponse,
  ModelsListResponse,
  ProviderConnectionStatus,
} from "../types/provider";
import { ProviderApiClient } from "./ProviderApiClient";

class ProviderService {
  constructor() {
    // No-op: Session model config is stored separately
  }

  /**
   * Connect provider - delegates to backend API
   */
  async connectProvider(
    request: ConnectProviderRequest,
  ): Promise<ConnectProviderResponse> {
    return ProviderApiClient.connect(request);
  }

  /**
   * Disconnect provider - delegates to backend API
   */
  async disconnectProvider(
    request: DisconnectProviderRequest,
  ): Promise<DisconnectProviderResponse> {
    return ProviderApiClient.disconnect(request);
  }

  /**
   * Get models - delegates to backend API
   */
  async getModels(providerId: ProviderId): Promise<ModelsListResponse> {
    return ProviderApiClient.getModels(providerId);
  }

  /**
   * Get provider status - delegates to backend API
   */
  async getProviderStatus(): Promise<ProviderConnectionStatus[]> {
    return ProviderApiClient.getStatus();
  }

  /**
   * Get session-level model config from localStorage
   */
  getSessionModelConfig(sessionId: string): {
    providerId?: string;
    modelId?: string;
  } {
    try {
      const stored = localStorage.getItem(
        `session_model_config_${sessionId}`,
      );
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error("[provider/sessionConfig] Failed to parse config:", e);
    }
    return {};
  }

  /**
   * Set session-level model config in localStorage
   */
  setSessionModelConfig(
    sessionId: string,
    providerId: string,
    modelId: string,
  ): void {
    try {
      const config = { providerId, modelId };
      localStorage.setItem(
        `session_model_config_${sessionId}`,
        JSON.stringify(config),
      );
      console.log(`[provider/sessionConfig] Session ${sessionId} updated`);
    } catch (e) {
      console.error("[provider/sessionConfig] Failed to save config:", e);
    }
  }

}

export const providerService = new ProviderService();
