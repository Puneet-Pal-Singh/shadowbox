/**
 * ModelDropdown Component
 * Compact provider/model selector for chat input toolbar
 */

import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { providerService } from "../../services/ProviderService";
import type { ProviderId, ModelDescriptor } from "../../types/provider";

interface ModelDropdownProps {
  sessionId: string;
  onModelSelect?: (providerId: ProviderId, modelId: string) => void;
  disabled?: boolean;
}

export function ModelDropdown({
  sessionId,
  onModelSelect,
  disabled,
}: ModelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(
    "openrouter",
  );
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load models for selected provider
  useEffect(() => {
    const config = providerService.getSessionModelConfig(sessionId);
    const providerId = (config.providerId ?? "openrouter") as ProviderId;
    setSelectedProvider(providerId);
    setSelectedModel(config.modelId ?? "");

    const loadModels = async () => {
      setIsLoading(true);
      try {
        const result = await providerService.getModels(providerId);
        setModels(result.models);
      } catch (e) {
        console.error("[ModelDropdown] Failed to load models:", e);
        setModels([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadModels();
  }, [sessionId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleProviderChange = (newProvider: ProviderId) => {
    setSelectedProvider(newProvider);
    setSelectedModel("");
    setIsLoading(true);
    providerService
      .getModels(newProvider)
      .then((result) => {
        setModels(result.models);
        const firstModel = result.models[0];
        if (firstModel) {
          setSelectedModel(firstModel.id);
          onModelSelect?.(newProvider, firstModel.id);
          providerService.setSessionModelConfig(
            sessionId,
            newProvider,
            firstModel.id,
          );
        }
      })
      .catch((e) => {
        console.error("[ModelDropdown] Failed to load models:", e);
        setModels([]);
      })
      .finally(() => setIsLoading(false));
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    onModelSelect?.(selectedProvider, modelId);
    providerService.setSessionModelConfig(sessionId, selectedProvider, modelId);
    setIsOpen(false);
  };

  const displayModel = selectedModel || (isLoading ? "Loading..." : "Select");
  const displayProvider = selectedProvider || "OpenRouter";

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        type="button"
        className="flex items-center gap-1 px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors rounded border border-transparent hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="font-medium truncate max-w-[120px]">
          {displayModel}
        </span>
        <span className="text-zinc-600 hidden sm:inline text-[10px]">
          {displayProvider}
        </span>
        <ChevronDown size={12} className={isOpen ? "rotate-180" : ""} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 z-50 min-w-[180px] bg-zinc-900 rounded border border-zinc-700 shadow-lg">
          {/* Provider selector */}
          <div className="px-3 py-2 border-b border-zinc-700">
            <div className="text-xs font-medium text-zinc-400 mb-2">
              Provider
            </div>
            <div className="space-y-1">
              {["openrouter", "openai"].map((provider) => (
                <button
                  key={provider}
                  onClick={() => handleProviderChange(provider as ProviderId)}
                  className={`
                    w-full text-left px-2 py-1 text-xs rounded transition-colors
                    ${
                      selectedProvider === provider
                        ? "bg-blue-900 text-blue-200"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                    }
                  `}
                >
                  {provider === "openrouter"
                    ? "OpenRouter (Recommended)"
                    : "OpenAI"}
                </button>
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div className="px-3 py-2 max-h-[180px] overflow-y-auto">
            <div className="text-xs font-medium text-zinc-400 mb-2">Model</div>
            {isLoading ? (
              <div className="text-xs text-zinc-500 py-2">Loading models...</div>
            ) : models.length === 0 ? (
              <div className="text-xs text-zinc-500 py-2">No models available</div>
            ) : (
              <div className="space-y-1">
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => handleModelChange(model.id)}
                    className={`
                      w-full text-left px-2 py-1 text-xs rounded transition-colors truncate
                      ${
                        selectedModel === model.id
                          ? "bg-green-900 text-green-200"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                      }
                    `}
                    title={model.name}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
