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

type SessionModelConfigListener = (config: {
  providerId?: string;
  modelId?: string;
}) => void;

class ProviderService {
  private listeners: Map<string, Set<SessionModelConfigListener>> = new Map();

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
   * Notifies all listeners of the change
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

      // Notify all listeners for this session
      this.notifyListeners(sessionId, config);
    } catch (e) {
      console.error("[provider/sessionConfig] Failed to save config:", e);
    }
  }

  /**
   * Subscribe to session model config changes
   * Returns unsubscribe function
   */
  subscribeToSessionConfig(
    sessionId: string,
    listener: SessionModelConfigListener,
  ): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }

    const sessionListeners = this.listeners.get(sessionId)!;
    sessionListeners.add(listener);

    // Return unsubscribe function
    return (): void => {
      sessionListeners.delete(listener);
      if (sessionListeners.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }

  /**
   * Notify all listeners of a config change
   */
  private notifyListeners(
    sessionId: string,
    config: { providerId?: string; modelId?: string },
  ): void {
    const sessionListeners = this.listeners.get(sessionId);
    if (sessionListeners) {
      sessionListeners.forEach((listener): void => {
        listener(config);
      });
    }
  }
}

export const providerService = new ProviderService();
