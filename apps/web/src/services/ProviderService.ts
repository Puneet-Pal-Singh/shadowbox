/**
 * ProviderService
 * Client-side service for provider management.
 * Now delegates API operations to backend via ProviderApiClient.
 * Keeps session model config in sync with persisted BYOK preferences.
 */

import type {
  BYOKPreferences,
  BYOKPreferencesPatch,
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
  providerId?: ProviderId;
  modelId?: string;
}) => void;

interface SessionModelConfig {
  providerId?: ProviderId;
  modelId?: string;
}

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

  async getPreferences(): Promise<BYOKPreferences> {
    return ProviderApiClient.getPreferences();
  }

  async updatePreferences(patch: BYOKPreferencesPatch): Promise<BYOKPreferences> {
    return ProviderApiClient.updatePreferences(patch);
  }

  /**
   * Get session-level model config from localStorage
   */
  getSessionModelConfig(sessionId: string): {
    providerId?: ProviderId;
    modelId?: string;
  } {
    try {
      const stored = localStorage.getItem(this.getSessionConfigStorageKey(sessionId));
      if (stored) {
        return JSON.parse(stored) as SessionModelConfig;
      }
    } catch (e) {
      console.error("[provider/sessionConfig] Failed to parse config:", e);
    }
    return {};
  }

  /**
   * Load persisted BYOK preferences and sync into session-scoped UI config.
   * Local storage is treated as cache only, not source-of-truth.
   */
  async syncSessionModelConfig(sessionId: string): Promise<SessionModelConfig> {
    try {
      const preferences = await ProviderApiClient.getPreferences();
      const config = this.mapPreferencesToConfig(preferences);
      this.storeSessionModelConfig(sessionId, config);
      this.notifyListeners(sessionId, config);
      return config;
    } catch (error) {
      console.warn(
        `[provider/sessionConfig] Failed to sync persisted preferences for session ${sessionId}`,
        error,
      );
      return this.getSessionModelConfig(sessionId);
    }
  }

  /**
   * Set session-level model config in localStorage
   * Notifies all listeners of the change
   */
  setSessionModelConfig(
    sessionId: string,
    providerId: ProviderId,
    modelId: string,
  ): void {
    try {
      const config = { providerId, modelId };
      this.storeSessionModelConfig(sessionId, config);
      console.log(`[provider/sessionConfig] Session ${sessionId} updated`);

      // Notify all listeners for this session
      this.notifyListeners(sessionId, config);
      void this.persistPreferences(config);
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
    config: { providerId?: ProviderId; modelId?: string },
  ): void {
    const sessionListeners = this.listeners.get(sessionId);
    if (sessionListeners) {
      sessionListeners.forEach((listener): void => {
        listener(config);
      });
    }
  }

  private getSessionConfigStorageKey(sessionId: string): string {
    return `session_model_config_${sessionId}`;
  }

  private storeSessionModelConfig(
    sessionId: string,
    config: SessionModelConfig,
  ): void {
    localStorage.setItem(
      this.getSessionConfigStorageKey(sessionId),
      JSON.stringify(config),
    );
  }

  private mapPreferencesToConfig(preferences: BYOKPreferences): SessionModelConfig {
    if (!preferences.defaultProviderId || !preferences.defaultModelId) {
      return {};
    }
    return {
      providerId: preferences.defaultProviderId,
      modelId: preferences.defaultModelId,
    };
  }

  private async persistPreferences(config: SessionModelConfig): Promise<void> {
    if (!config.providerId || !config.modelId) {
      return;
    }
    try {
      await ProviderApiClient.updatePreferences({
        defaultProviderId: config.providerId,
        defaultModelId: config.modelId,
      });
    } catch (error) {
      console.warn(
        "[provider/sessionConfig] Failed to persist BYOK preferences",
        error,
      );
    }
  }
}

export const providerService = new ProviderService();
