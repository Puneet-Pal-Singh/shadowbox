/**
 * ProviderConnectionDialog Component
 * Unified BYOK provider connection, validation, and model selection UX.
 * Consolidates ProviderSettings + ModelSelector + ModelDropdown flows.
 */

import { useState } from "react";
import { Check, X, AlertCircle, Loader, ChevronDown } from "lucide-react";
import { useProviderConnection } from "../../hooks/useProviderConnection";
import type { ProviderId } from "../../types/provider";

interface ProviderConnectionDialogProps {
  sessionId?: string;
  isOpen: boolean;
  onClose: () => void;
  onProviderConnect?: (providerId: ProviderId) => void;
  onModelSelect?: (providerId: ProviderId, modelId: string) => void;
}

type DialogStep = "overview" | "connect" | "select-model";

export function ProviderConnectionDialog({
  sessionId,
  isOpen,
  onClose,
  onProviderConnect,
  onModelSelect,
}: ProviderConnectionDialogProps) {
  const [step, setStep] = useState<DialogStep>("overview");
  const [apiKey, setApiKey] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const {
    providers,
    selectedProvider,
    models,
    selectedModel,
    isLoading,
    error,
    selectProvider,
    selectModel,
    connectProvider,
    disconnectProvider,
    clearError,
  } = useProviderConnection({ sessionId, autoLoadModels: true });

  if (!isOpen) return null;

  const currentProviderStatus = providers.find((p) => p.providerId === selectedProvider);
  const isConnected = currentProviderStatus?.status === "connected";

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      clearError();
      return;
    }

    setIsValidating(true);
    const result = await connectProvider(apiKey);
    setIsValidating(false);

    if (result.success) {
      setApiKey("");
      onProviderConnect?.(selectedProvider);
      setStep(isLoading ? "overview" : "select-model");
    }
  };

  const handleModelSelect = async (modelId: string) => {
    await selectModel(modelId);
    onModelSelect?.(selectedProvider, modelId);
    setStep("overview");
  };

  const handleDisconnect = async () => {
    await disconnectProvider(selectedProvider);
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "connected":
        return <Check className="w-4 h-4 text-green-500" />;
      case "failed":
        return <X className="w-4 h-4 text-red-500" />;
      default:
        return <X className="w-4 h-4 text-zinc-500" />;
    }
  };

  // Step 1: Overview - Show all providers and connection status
  if (step === "overview") {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 w-full max-w-lg max-h-[600px] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-200">Provider Settings</h2>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto space-y-4 p-4">
            {/* Provider Status List */}
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-3">Connected Providers</h3>
              <div className="space-y-2">
                {providers.map((provider) => (
                  <div
                    key={provider.providerId}
                    className="flex items-center justify-between p-3 bg-zinc-800 rounded border border-zinc-700 hover:border-zinc-600 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(provider.status)}
                      <span className="text-sm font-medium capitalize text-zinc-300">
                        {provider.providerId}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">{provider.status || "disconnected"}</span>
                      {provider.status === "connected" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDisconnect();
                          }}
                          disabled={isLoading}
                          className="text-xs px-2 py-1 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex gap-2 p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 p-4 border-t border-zinc-800">
            <button
              onClick={() => setStep("connect")}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
            >
              {isConnected ? "Add Another" : "Connect Provider"}
            </button>
            {isConnected && (
              <button
                onClick={() => setStep("select-model")}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors"
              >
                Select Model
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Connect - Enter API key and validate
  if (step === "connect") {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-200">
              Connect to {selectedProvider.toUpperCase()}
            </h2>
            <button
              onClick={() => setStep("overview")}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4 p-4">
            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Select Provider
              </label>
              <div className="relative">
                <select
                  value={selectedProvider}
                  onChange={(e) => selectProvider(e.target.value as ProviderId)}
                  className="w-full bg-zinc-800 text-zinc-200 text-sm rounded px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 appearance-none"
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI</option>
                  <option value="groq">Groq</option>
                </select>
                <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            {/* API Key Input */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  clearError();
                }}
                placeholder="Paste your API key"
                className="w-full bg-zinc-800 text-zinc-200 text-sm rounded px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Your API key is secure and not logged.
              </p>
            </div>

            {error && (
              <div className="flex gap-2 p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 p-4 border-t border-zinc-800">
            <button
              onClick={() => setStep("overview")}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleConnect}
              disabled={isValidating || !apiKey.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
            >
              {isValidating && <Loader className="w-4 h-4 animate-spin" />}
              Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Select Model
  if (step === "select-model") {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 w-full max-w-lg max-h-[600px] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-200">Select Model</h2>
            <button
              onClick={() => setStep("overview")}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-4 h-4 animate-spin text-zinc-500" />
                <span className="ml-2 text-sm text-zinc-500">Loading models...</span>
              </div>
            ) : models.length === 0 ? (
              <div className="text-sm text-zinc-500 py-8 text-center">
                No models available for {selectedProvider}
              </div>
            ) : (
              <div className="space-y-2">
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => handleModelSelect(model.id)}
                    className={`
                      w-full text-left px-4 py-3 rounded border transition-colors
                      ${
                        selectedModel === model.id
                          ? "bg-green-900/30 border-green-700 text-green-200"
                          : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600"
                      }
                    `}
                  >
                    <div className="font-medium text-sm">{model.name}</div>
                    {model.description && (
                      <div className="text-xs text-zinc-500 mt-1">{model.description}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 p-4 border-t border-zinc-800">
            <button
              onClick={() => setStep("overview")}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep("overview")}
              disabled={!selectedModel}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-900 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
