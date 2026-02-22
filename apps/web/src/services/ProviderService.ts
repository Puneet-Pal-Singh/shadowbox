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
    const localConfig = this.getSessionModelConfig(sessionId);
    try {
      const preferences = await ProviderApiClient.getPreferences();
      const config = this.mapPreferencesToConfig(preferences);
      const candidateConfig = this.hasPersistableModelConfig(config)
        ? config
        : localConfig;
      const resolvedConfig =
        await this.resolveConnectedSessionModelConfig(candidateConfig);
      this.persistResolvedConfig(sessionId, localConfig, resolvedConfig);
      return resolvedConfig;
    } catch (error) {
      console.warn(
        `[provider/sessionConfig] Failed to sync persisted preferences for session ${sessionId}`,
        error,
      );
      const resolvedConfig =
        await this.resolveConnectedSessionModelConfig(localConfig);
      this.persistResolvedConfig(sessionId, localConfig, resolvedConfig);
      return resolvedConfig;
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
    if (!this.hasPersistableModelConfig(config)) {
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

  private hasPersistableModelConfig(
    config: SessionModelConfig,
  ): config is { providerId: ProviderId; modelId: string } {
    return !!config.providerId && !!config.modelId;
  }

  private async resolveConnectedSessionModelConfig(
    config: SessionModelConfig,
  ): Promise<SessionModelConfig> {
    try {
      const statuses = await ProviderApiClient.getStatus();
      const connectedProviders = this.getConnectedProviders(statuses);
      if (
        this.hasPersistableModelConfig(config) &&
        connectedProviders.includes(config.providerId)
      ) {
        return config;
      }

      return await this.resolveDefaultConnectedConfig(connectedProviders);
    } catch (error) {
      console.warn(
        "[provider/sessionConfig] Failed to validate provider connectivity for session config",
        error,
      );
      if (this.hasPersistableModelConfig(config)) {
        return config;
      }
      return {};
    }
  }

  private getConnectedProviders(
    statuses: ProviderConnectionStatus[],
  ): ProviderId[] {
    return statuses
      .filter((status) => status.status === "connected")
      .map((status) => status.providerId);
  }

  private async resolveDefaultConnectedConfig(
    connectedProviders: ProviderId[],
  ): Promise<SessionModelConfig> {
    const providerId = connectedProviders[0];
    if (!providerId) {
      return {};
    }

    try {
      const modelsResponse = await ProviderApiClient.getModels(providerId);
      const modelId = modelsResponse.models[0]?.id;
      if (!modelId) {
        return {};
      }

      const config: SessionModelConfig = { providerId, modelId };
      await this.persistPreferences(config);
      return config;
    } catch (error) {
      console.warn(
        `[provider/sessionConfig] Failed to resolve default model for provider ${providerId}`,
        error,
      );
      return {};
    }
  }

  private persistResolvedConfig(
    sessionId: string,
    current: SessionModelConfig,
    next: SessionModelConfig,
  ): void {
    if (this.isSameSessionModelConfig(current, next)) {
      return;
    }
    this.storeSessionModelConfig(sessionId, next);
    this.notifyListeners(sessionId, next);
  }

  private isSameSessionModelConfig(
    left: SessionModelConfig,
    right: SessionModelConfig,
  ): boolean {
    return left.providerId === right.providerId && left.modelId === right.modelId;
  }
}

export const providerService = new ProviderService();
