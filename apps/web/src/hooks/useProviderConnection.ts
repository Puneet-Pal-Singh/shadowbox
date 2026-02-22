/**
 * useProviderConnection Hook
 * Unified provider connection state management for BYOK consolidation.
 * Single source of truth for provider status, model selection, and validation flow.
 */

import { useState, useEffect, useCallback } from "react";
import { providerService } from "../services/ProviderService";
import type { ProviderId, ModelDescriptor, ProviderConnectionStatus } from "../types/provider";

interface ProviderConnectionState {
  // Provider status
  providers: ProviderConnectionStatus[];
  selectedProvider: ProviderId;
  connectionStatus: ProviderConnectionStatus | undefined;

  // Model selection
  models: ModelDescriptor[];
  selectedModel: string;

  // UI state
  isLoading: boolean;
  isValidating: boolean;
  error: string | null;
}

interface UseProviderConnectionOptions {
  sessionId?: string;
  autoLoadModels?: boolean;
}

export function useProviderConnection(options: UseProviderConnectionOptions = {}) {
  const { sessionId, autoLoadModels = true } = options;

  const [state, setState] = useState<ProviderConnectionState>({
    providers: [],
    selectedProvider: "openrouter",
    connectionStatus: undefined,
    models: [],
    selectedModel: "",
    isLoading: false,
    isValidating: false,
    error: null,
  });

  // Load all provider statuses
  const loadProviderStatuses = useCallback(async () => {
    try {
      const statuses = await providerService.getProviderStatus();
      setState((prev) => ({
        ...prev,
        providers: statuses,
        connectionStatus: statuses.find((p) => p.providerId === prev.selectedProvider),
      }));
    } catch (e) {
      console.error("[useProviderConnection] Failed to load provider statuses:", e);
      setState((prev) => ({
        ...prev,
        error: "Failed to load provider statuses",
      }));
    }
  }, []);

  // Load models for selected provider
  const loadModels = useCallback(
    async (providerId: ProviderId) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await providerService.getModels(providerId);
        setState((prev) => ({
          ...prev,
          models: result.models,
          selectedModel: result.models[0]?.id ?? "",
          isLoading: false,
        }));
      } catch (e) {
        console.error("[useProviderConnection] Failed to load models:", e);
        setState((prev) => ({
          ...prev,
          models: [],
          selectedModel: "",
          isLoading: false,
          error: e instanceof Error ? e.message : "Failed to load models",
        }));
      }
    },
    [],
  );

  // Sync session preferences on mount
  useEffect(() => {
    let cancelled = false;

    const syncPreferences = async () => {
      if (!sessionId || !autoLoadModels) {
        await loadProviderStatuses();
        return;
      }

      try {
        const config = await providerService.syncSessionModelConfig(sessionId);
        if (cancelled) return;

        const providerId = (config.providerId ?? "openrouter") as ProviderId;
        setState((prev) => ({
          ...prev,
          selectedProvider: providerId,
          selectedModel: config.modelId ?? "",
        }));

        await loadProviderStatuses();
        await loadModels(providerId);
      } catch (e) {
        console.error("[useProviderConnection] Failed to sync preferences:", e);
        await loadProviderStatuses();
      }
    };

    void syncPreferences();

    return () => {
      cancelled = true;
    };
  }, [sessionId, autoLoadModels, loadProviderStatuses, loadModels]);

  // Change provider and reload models
  const selectProvider = useCallback(
    async (providerId: ProviderId) => {
      setState((prev) => ({
        ...prev,
        selectedProvider: providerId,
        selectedModel: "",
      }));

      if (autoLoadModels) {
        await loadModels(providerId);
      }

      // Update session config if session exists
      if (sessionId) {
        try {
          await providerService.setSessionModelConfig(sessionId, providerId, "");
        } catch (e) {
          console.error("[useProviderConnection] Failed to update provider:", e);
        }
      }
    },
    [sessionId, autoLoadModels, loadModels],
  );

  // Select model and save preference
  const selectModel = useCallback(
    async (modelId: string) => {
      setState((prev) => ({ ...prev, selectedModel: modelId, error: null }));

      if (sessionId) {
        try {
          await providerService.setSessionModelConfig(
            sessionId,
            state.selectedProvider,
            modelId,
          );
        } catch (e) {
          console.error("[useProviderConnection] Failed to update model:", e);
          setState((prev) => ({
            ...prev,
            error: "Failed to save model selection",
          }));
        }
      }
    },
    [sessionId, state.selectedProvider],
  );

  // Connect provider with API key
  const connectProvider = useCallback(
    async (apiKey: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await providerService.connectProvider({
          providerId: state.selectedProvider,
          apiKey: apiKey.trim(),
        });

        if (result.status === "failed") {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: result.errorMessage || "Failed to connect",
          }));
          return { success: false, error: result.errorMessage || "Failed to connect" };
        }

        await loadProviderStatuses();
        setState((prev) => ({ ...prev, isLoading: false }));
        return { success: true };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Unknown error";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }));
        return { success: false, error: errorMsg };
      }
    },
    [state.selectedProvider, loadProviderStatuses],
  );

  // Disconnect provider
  const disconnectProvider = useCallback(
    async (providerId: ProviderId) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        await providerService.disconnectProvider({ providerId });
        await loadProviderStatuses();
        setState((prev) => ({ ...prev, isLoading: false }));
        return { success: true };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Failed to disconnect";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }));
        return { success: false, error: errorMsg };
      }
    },
    [loadProviderStatuses],
  );

  // Validate provider credentials
  const validateProvider = useCallback(
    async (apiKey?: string) => {
      setState((prev) => ({ ...prev, isValidating: true, error: null }));

      try {
        const result = await providerService.validateProvider({
          providerId: state.selectedProvider,
          apiKey: apiKey?.trim(),
        });

        setState((prev) => ({ ...prev, isValidating: false }));
        return { success: result.valid, status: result.status };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Validation failed";
        setState((prev) => ({
          ...prev,
          isValidating: false,
          error: errorMsg,
        }));
        return { success: false, error: errorMsg };
      }
    },
    [state.selectedProvider],
  );

  // Clear error
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    ...state,

    // Actions
    selectProvider,
    selectModel,
    connectProvider,
    disconnectProvider,
    validateProvider,
    loadProviderStatuses,
    loadModels,
    clearError,
  };
}
