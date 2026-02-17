/**
 * ModelSelector Component
 * UI for selecting and configuring model for a session.
 */

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { providerService } from "../../services/ProviderService";
import type { ProviderId, ModelDescriptor } from "../../types/provider";

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

        // Use the override (from saved config) if provided, otherwise use component state
        const modelToCheck = selectedModelOverride ?? selectedModel;

        if (result.models.length > 0 && !modelToCheck) {
          const firstModel = result.models[0];
          if (firstModel) {
            setSelectedModel(firstModel.id);
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
    [selectedModel],
  );

  // Load saved config and available models
  useEffect(() => {
    const config = providerService.getSessionModelConfig(sessionId);
    const providerId = (config.providerId as ProviderId) || "openrouter";
    const savedModelId = config.modelId;

    if (config.providerId) {
      setSelectedProvider(config.providerId as ProviderId);
    }
    if (config.modelId) {
      setSelectedModel(config.modelId);
    }

    loadModels(providerId, savedModelId);
  }, [sessionId, loadModels]);

  const handleProviderChange = (newProvider: ProviderId) => {
    setSelectedProvider(newProvider);
    setSelectedModel("");
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
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
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
