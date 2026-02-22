/**
 * ProviderModelSelector Component
 * Compact unified provider/model selector for chat input toolbar.
 * Replaces previous ModelDropdown with consolidated state management.
 */

import { useState, useEffect, useRef } from "react";
import { ChevronDown, AlertCircle } from "lucide-react";
import { useProviderConnection } from "../../hooks/useProviderConnection";
import type { ProviderId } from "../../types/provider";

interface ProviderModelSelectorProps {
  sessionId: string;
  onModelSelect?: (providerId: ProviderId, modelId: string) => void;
  onConnectClick?: () => void;
  disabled?: boolean;
}

export function ProviderModelSelector({
  sessionId,
  onModelSelect,
  onConnectClick,
  disabled,
}: ProviderModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    providers,
    selectedProvider,
    models,
    selectedModel,
    isLoading,
    error,
    selectProvider,
    selectModel,
  } = useProviderConnection({ sessionId, autoLoadModels: true });

  // Handle click outside and escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const displayModel = selectedModel || (isLoading ? "Loading..." : "Select Model");
  const displayProvider = selectedProvider || "OpenRouter";

  const handleModelChange = async (modelId: string) => {
    await selectModel(modelId);
    onModelSelect?.(selectedProvider, modelId);
    setIsOpen(false);
  };

  const handleProviderChange = async (newProvider: ProviderId) => {
    if (!providers.some((p) => p.providerId === newProvider && p.status === "connected")) {
      onConnectClick?.();
      return;
    }
    await selectProvider(newProvider);
  };

  // Show "Connect" prompt if no providers connected
  if (providers.length === 0 || !providers.some((p) => p.status === "connected")) {
    return (
      <button
        onClick={onConnectClick}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-50 rounded border border-red-800/50 hover:border-red-700 transition-colors"
      >
        <AlertCircle className="w-3 h-3" />
        <span>Connect Provider</span>
      </button>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Select model: ${displayModel}`}
        className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors rounded border border-transparent hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="font-medium truncate max-w-[120px]">{displayModel}</span>
        <span className="text-zinc-600 hidden sm:inline text-[10px]">{displayProvider}</span>
        <ChevronDown size={12} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 z-50 min-w-[200px] bg-zinc-900 rounded border border-zinc-700 shadow-lg">
          {/* Provider selector */}
          <div className="px-3 py-2 border-b border-zinc-700">
            <div className="text-xs font-medium text-zinc-400 mb-2">Provider</div>
            <div className="space-y-1">
              {providers.map((provider) => (
                <button
                  key={provider.providerId}
                  onClick={() => handleProviderChange(provider.providerId)}
                  disabled={provider.status !== "connected"}
                  className={`
                    w-full text-left px-2 py-1 text-xs rounded transition-colors
                    ${
                      selectedProvider === provider.providerId
                        ? "bg-blue-900 text-blue-200"
                        : provider.status === "connected"
                          ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                          : "text-zinc-600 opacity-50 cursor-not-allowed"
                    }
                  `}
                  title={provider.status !== "connected" ? "Provider not connected" : ""}
                >
                  {provider.providerId === "openrouter"
                    ? "OpenRouter (Recommended)"
                    : provider.providerId === "groq"
                      ? "Groq (Fast)"
                      : "OpenAI"}
                  {provider.status === "connected" && " ✓"}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 text-xs text-red-300">
              <AlertCircle className="w-3 h-3 inline mr-1" />
              {error}
            </div>
          )}

          {/* Model selector */}
          <div className="px-3 py-2 max-h-[200px] overflow-y-auto">
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
