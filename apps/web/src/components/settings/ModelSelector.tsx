/**
 * ModelSelector Component
 * UI for selecting and configuring model for a session.
 */

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { providerService } from "../../services/ProviderService";
import type {
  ProviderId,
  ModelDescriptor,
  ProviderConnectionStatus,
} from "../../types/provider";

interface ModelSelectorProps {
  sessionId: string;
  onModelSelect?: (providerId: ProviderId, modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({
  sessionId,
  onModelSelect,
  disabled,
}: ModelSelectorProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(
    "openrouter",
  );
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [providers, setProviders] = useState<ProviderConnectionStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load models from provider
  const loadModels = useCallback(
    async (
      providerId: ProviderId,
      selectedModelOverride?: string,
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await providerService.getModels(providerId);
        setModels(result.models);

        // Use the explicit override from the current flow to avoid stale closure reads.
        const modelToCheck = selectedModelOverride ?? "";

        if (result.models.length > 0 && !modelToCheck) {
          const firstModel = result.models[0];
          if (firstModel) {
            setSelectedModel(firstModel.id);
            providerService.setSessionModelConfig(
              sessionId,
              providerId,
              firstModel.id,
            );
            onModelSelect?.(providerId, firstModel.id);
          }
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to load models",
        );
        setModels([]);
      } finally {
        setIsLoading(false);
      }
    },
    [onModelSelect, sessionId],
  );

  // Load saved config and available models
  useEffect(() => {
    let cancelled = false;
    const initializeFromPreferences = async () => {
      try {
        const config = await providerService.syncSessionModelConfig(sessionId);
        if (cancelled) {
          return;
        }

        const statuses = await providerService.getProviderStatus();
        if (cancelled) {
          return;
        }
        setProviders(statuses);

        const connectedProviders = getConnectedProviders(statuses);
        const providerId =
          (config.providerId && connectedProviders.includes(config.providerId)
            ? config.providerId
            : connectedProviders[0]) ?? "openrouter";
        const savedModelId = config.modelId;

        setSelectedProvider(providerId);
        if (config.providerId === providerId && config.modelId) {
          setSelectedModel(config.modelId);
        }

        if (connectedProviders.length === 0) {
          setModels([]);
          setError("No BYOK provider connected. Connect one in settings.");
          return;
        }

        loadModels(providerId, savedModelId);
      } catch (e) {
        if (!cancelled) {
          setModels([]);
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load provider preferences",
          );
        }
      }
    };

    void initializeFromPreferences();

    return () => {
      cancelled = true;
    };
  }, [sessionId, loadModels]);

  const handleProviderChange = (newProvider: ProviderId) => {
    if (!isProviderConnected(providers, newProvider)) {
      setError(
        `Provider ${newProvider} is not connected. Connect it in settings first.`,
      );
      return;
    }
    setSelectedProvider(newProvider);
    setSelectedModel("");
    setError(null);
    // Pass empty string explicitly to avoid stale closure of selectedModel
    loadModels(newProvider, "");
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    onModelSelect?.(selectedProvider, modelId);
    providerService.setSessionModelConfig(sessionId, selectedProvider, modelId);
  };

  return (
    <div className="space-y-3 p-4 bg-zinc-900 rounded border border-zinc-800">
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-2">
          Provider
        </label>
        <div className="relative">
          <select
            value={selectedProvider}
            onChange={(e) =>
              handleProviderChange(e.target.value as ProviderId)
            }
            disabled={disabled}
            className="w-full bg-zinc-800 text-zinc-200 text-sm rounded px-3 py-2 appearance-none cursor-pointer border border-zinc-700 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          >
            {providers.map((provider) => (
              <option
                key={provider.providerId}
                value={provider.providerId}
                disabled={provider.status !== "connected"}
              >
                {provider.providerId === "openrouter"
                  ? "OpenRouter"
                  : provider.providerId === "groq"
                  ? "Groq"
                  : "OpenAI"}
                {provider.status !== "connected" ? " (disconnected)" : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-2.5 pointer-events-none" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-2">
          Model
        </label>
        {isLoading ? (
          <div className="flex items-center justify-center p-2 bg-zinc-800 rounded text-sm text-zinc-500">
            Loading models...
          </div>
        ) : error ? (
          <div className="flex gap-2 p-2 bg-red-900 bg-opacity-20 border border-red-800 rounded text-xs text-red-300">
            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : models.length === 0 ? (
          <div className="flex items-center justify-center p-2 bg-zinc-800 rounded text-sm text-zinc-500">
            No models available
          </div>
        ) : (
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={disabled || models.length === 0}
              className="w-full bg-zinc-800 text-zinc-200 text-sm rounded px-3 py-2 appearance-none cursor-pointer border border-zinc-700 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-2.5 pointer-events-none" />
          </div>
        )}
      </div>

      {selectedModel && selectedProvider && (
        <div className="text-xs text-zinc-500 p-2 bg-zinc-950 rounded border border-zinc-800">
          <span className="text-zinc-400">Selected: </span>
          {selectedModel}
        </div>
      )}
    </div>
  );
}

function getConnectedProviders(
  providers: ProviderConnectionStatus[],
): ProviderId[] {
  return providers
    .filter((provider) => provider.status === "connected")
    .map((provider) => provider.providerId);
}

function isProviderConnected(
  providers: ProviderConnectionStatus[],
  providerId: ProviderId,
): boolean {
  return providers.some(
    (provider) =>
      provider.providerId === providerId && provider.status === "connected",
  );
}
