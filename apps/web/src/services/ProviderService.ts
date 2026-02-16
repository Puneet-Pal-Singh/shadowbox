/**
 * ProviderService
 * Client-side service for provider key management and model selection.
 * Handles BYOK configuration and session-level model preferences.
 */

import type {
  ProviderId,
  ConnectProviderRequest,
  ConnectProviderResponse,
  DisconnectProviderRequest,
  DisconnectProviderResponse,
  ModelsListResponse,
  ProviderConnectionStatus,
  ModelDescriptor,
} from "../types/provider";

// Static model catalog for v1
const MODEL_CATALOG: Record<ProviderId, ModelDescriptor[]> = {
  openrouter: [
    {
      id: "openrouter/auto",
      name: "Auto (Recommended)",
      provider: "openrouter",
      description: "Automatically routes to the best available model",
    },
    {
      id: "openai/gpt-4-turbo-preview",
      name: "GPT-4 Turbo",
      provider: "openrouter",
      contextWindow: 128000,
      costPer1kTokens: { input: 0.01, output: 0.03 },
    },
    {
      id: "openai/gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      provider: "openrouter",
      contextWindow: 4096,
      costPer1kTokens: { input: 0.0005, output: 0.0015 },
    },
    {
      id: "anthropic/claude-3-sonnet",
      name: "Claude 3 Sonnet",
      provider: "openrouter",
      contextWindow: 200000,
      costPer1kTokens: { input: 0.003, output: 0.015 },
    },
  ],
  openai: [
    {
      id: "gpt-4-turbo-preview",
      name: "GPT-4 Turbo",
      provider: "openai",
      contextWindow: 128000,
      costPer1kTokens: { input: 0.01, output: 0.03 },
    },
    {
      id: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      provider: "openai",
      contextWindow: 4096,
      costPer1kTokens: { input: 0.0005, output: 0.0015 },
    },
  ],
};

class ProviderService {
  private providerConfigs: Map<ProviderId, { apiKey: string; connected: boolean }> =
    new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem("provider_configs");
      if (stored) {
        const configs = JSON.parse(stored);
        for (const [provider, config] of Object.entries(configs)) {
          if (config && typeof config === "object" && "connected" in config) {
            this.providerConfigs.set(provider as ProviderId, {
              apiKey: (config as Record<string, unknown>).apiKey as string || "",
              connected: (config as Record<string, unknown>).connected as boolean || false,
            });
          }
        }
      }
    } catch (e) {
      console.error("[provider/storage] Failed to load config:", e);
    }
  }

  private saveToStorage(): void {
    try {
      const configs: Record<string, unknown> = {};
      this.providerConfigs.forEach((config, provider) => {
        configs[provider] = { connected: config.connected };
        // Never save raw API key to localStorage
      });
      localStorage.setItem("provider_configs", JSON.stringify(configs));
    } catch (e) {
      console.error("[provider/storage] Failed to save config:", e);
    }
  }

  async connectProvider(
    request: ConnectProviderRequest,
  ): Promise<ConnectProviderResponse> {
    try {
      if (!request.apiKey?.trim()) {
        return {
          status: "failed",
          providerId: request.providerId,
          errorMessage: "API key cannot be empty",
        };
      }

      // In v1, we validate basic format only
      if (request.apiKey.length < 10) {
        return {
          status: "failed",
          providerId: request.providerId,
          errorMessage: "API key appears invalid (too short)",
        };
      }

      // Store config (API key is sensitive and stored only in memory)
      this.providerConfigs.set(request.providerId, {
        apiKey: request.apiKey,
        connected: true,
      });

      this.saveToStorage();

      console.log(
        `[provider/connect] ${request.providerId} connected (key masked)`,
      );

      return {
        status: "connected",
        providerId: request.providerId,
      };
    } catch (error) {
      console.error("[provider/connect] Error:", error);
      return {
        status: "failed",
        providerId: request.providerId,
        errorMessage:
          error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async disconnectProvider(
    request: DisconnectProviderRequest,
  ): Promise<DisconnectProviderResponse> {
    try {
      this.providerConfigs.delete(request.providerId);
      this.saveToStorage();

      console.log(`[provider/disconnect] ${request.providerId} disconnected`);

      return {
        status: "disconnected",
        providerId: request.providerId,
      };
    } catch (error) {
      console.error("[provider/disconnect] Error:", error);
      throw error;
    }
  }

  async getModels(providerId: ProviderId): Promise<ModelsListResponse> {
    try {
      const models = MODEL_CATALOG[providerId] || [];

      console.log(
        `[provider/models] Fetched ${models.length} models for ${providerId}`,
      );

      return {
        providerId,
        models,
        lastFetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[provider/models] Error:", error);
      throw error;
    }
  }

  async getProviderStatus(): Promise<ProviderConnectionStatus[]> {
    return ["openrouter", "openai"].map((providerId) => {
      const config = this.providerConfigs.get(providerId as ProviderId);
      return {
        providerId: providerId as ProviderId,
        status: config?.connected ? "connected" : "disconnected",
      };
    });
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

  /**
   * Get API key for a provider (internal use only)
   */
  getProviderApiKey(providerId: ProviderId): string | null {
    return this.providerConfigs.get(providerId)?.apiKey || null;
  }
}

export const providerService = new ProviderService();
