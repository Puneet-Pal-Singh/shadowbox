/**
 * ProviderSettings Component
 * UI for connecting/disconnecting providers and viewing status.
 */

import { useState, useEffect } from "react";
import { Check, X, AlertCircle, Loader } from "lucide-react";
import { providerService } from "../../services/ProviderService";
import type {
  ProviderId,
  ProviderConnectionStatus,
} from "../../types/provider";

interface ProviderSettingsProps {
  onProviderConnect?: (providerId: ProviderId) => void;
}

export function ProviderSettings({ onProviderConnect }: ProviderSettingsProps) {
  const [apiKey, setApiKey] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("openrouter");
  const [providers, setProviders] = useState<ProviderConnectionStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load provider statuses on mount
  useEffect(() => {
    loadProviderStatus();
  }, []);

  const loadProviderStatus = async () => {
    try {
      const statuses = await providerService.getProviderStatus();
      setProviders(statuses);
    } catch (e) {
      console.error("[ProviderSettings] Failed to load status:", e);
    }
  };

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await providerService.connectProvider({
        providerId: selectedProvider,
        apiKey: apiKey.trim(),
      });

      if (result.status === "failed") {
        setError(result.errorMessage || "Failed to connect");
      } else {
        setApiKey("");
        await loadProviderStatus();
        onProviderConnect?.(selectedProvider);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async (providerId: ProviderId) => {
    setIsLoading(true);
    try {
      await providerService.disconnectProvider({ providerId });
      await loadProviderStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setIsLoading(false);
    }
  };

  const getProviderStatus = (providerId: ProviderId) => {
    return providers.find((p) => p.providerId === providerId);
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

  return (
    <div className="space-y-6 p-6 bg-zinc-950 rounded-lg border border-zinc-800">
      <div>
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">
          Provider Settings
        </h2>

        {/* Provider Status Overview */}
        <div className="space-y-2 mb-6">
          {["openrouter", "openai"].map((providerId) => {
            const status = getProviderStatus(providerId as ProviderId);
            return (
              <div
                key={providerId}
                className="flex items-center justify-between p-3 bg-zinc-900 rounded border border-zinc-800"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(status?.status)}
                  <span className="text-sm font-medium capitalize text-zinc-300">
                    {providerId}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">
                    {status?.status || "disconnected"}
                  </span>
                  {status?.status === "connected" && (
                    <button
                      onClick={() =>
                        handleDisconnect(providerId as ProviderId)
                      }
                      disabled={isLoading}
                      className="text-xs px-2 py-1 text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Connect Form */}
        {!getProviderStatus(selectedProvider) ||
        getProviderStatus(selectedProvider)?.status !== "connected" ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Select Provider
              </label>
              <select
                value={selectedProvider}
                onChange={(e) =>
                  setSelectedProvider(e.target.value as ProviderId)
                }
                className="w-full bg-zinc-900 text-zinc-200 text-sm rounded px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
              >
                <option value="openrouter">OpenRouter (Recommended)</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError(null);
                }}
                placeholder="Enter your API key"
                className="w-full bg-zinc-900 text-zinc-200 text-sm rounded px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Your API key is not persisted to localStorage and is not sent to
                logs.
              </p>
            </div>

            {error && (
              <div className="flex gap-2 p-2 bg-red-900 bg-opacity-20 border border-red-800 rounded text-sm text-red-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={isLoading || !apiKey.trim()}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
            >
              {isLoading && <Loader className="w-4 h-4 animate-spin" />}
              Connect Provider
            </button>
          </div>
        ) : (
          <div className="p-3 bg-green-900 bg-opacity-20 border border-green-800 rounded text-sm text-green-300">
            ✓ {selectedProvider} is connected
          </div>
        )}
      </div>
    </div>
  );
}
