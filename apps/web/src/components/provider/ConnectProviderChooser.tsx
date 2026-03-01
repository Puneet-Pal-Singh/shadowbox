/**
 * Connect Provider Chooser - Searchable Provider Selection
 *
 * Provides a search-first UX for discovering and selecting providers
 * before entering API key. Replaces dropdown-based provider selection.
 *
 * Features:
 * - Searchable provider catalog
 * - Provider details and capability display
 * - API key input with format hints
 * - Connect + validate feedback
 * - Error recovery with remediation advice
 */

import React, { useMemo, useState, useRef, useEffect } from "react";
import { Search, AlertCircle, CheckCircle } from "lucide-react";
import { type ProviderRegistryEntry } from "@repo/shared-types";
import { getProviderRecoveryAdvice } from "../../lib/provider-recovery.js";

/**
 * Props for ConnectProviderChooser
 */
export interface ConnectProviderChooserProps {
  catalog: ProviderRegistryEntry[];
  onConnect: (providerId: string, secret: string, label?: string) => Promise<void>;
  isConnecting?: boolean;
  error?: string | null;
  success?: string | null;
  onErrorClear?: () => void;
}

/**
 * Provider details with formatted display
 */
interface ProviderOption {
  entry: ProviderRegistryEntry;
  displayName: string;
  description: string;
}

/**
 * ConnectProviderChooser Component
 */
export function ConnectProviderChooser({
  catalog,
  onConnect,
  isConnecting = false,
  error = null,
  success = null,
  onErrorClear,
}: ConnectProviderChooserProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Build provider options from catalog
  const providerOptions = useMemo((): ProviderOption[] => {
    return catalog.map((entry) => ({
      entry,
      displayName: entry.displayName,
      description: buildProviderDescription(entry),
    }));
  }, [catalog]);

  // Filter providers by search
  const filteredProviders = useMemo((): ProviderOption[] => {
    if (!searchQuery.trim()) {
      return providerOptions;
    }

    const query = searchQuery.toLowerCase();
    return providerOptions.filter(
      (option) =>
        option.displayName.toLowerCase().includes(query) ||
        option.entry.providerId.toLowerCase().includes(query) ||
        option.description.toLowerCase().includes(query)
    );
  }, [providerOptions, searchQuery]);

  // Get selected provider entry
  const selectedProvider = selectedProviderId
    ? catalog.find((p) => p.providerId === selectedProviderId)
    : null;

  // Handle provider selection
  const handleSelectProvider = (providerId: string): void => {
    setSelectedProviderId(providerId);
    // Clear any previous errors when selecting new provider
    if (onErrorClear) {
      onErrorClear();
    }
  };

  // Handle connect submission
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!selectedProviderId || !apiSecret.trim()) {
      return;
    }

    try {
      await onConnect(selectedProviderId, apiSecret, label || undefined);
      // Clear form on success
      setApiSecret("");
      setLabel("");
    } catch {
      // Error handled by parent and displayed
    }
  };

  // Focus search on mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Build error recovery message
  const errorRecovery = error ? getProviderRecoveryAdvice(error) : null;

  return (
    <div className="space-y-5 rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-neutral-100">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Connect provider</h3>
      </div>

      {/* Search Input */}
      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-400">
          Find Provider
        </label>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-neutral-500" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by provider name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`
              w-full rounded-lg border border-neutral-700 bg-neutral-800/80 pl-9 pr-3 py-2
              text-sm transition-colors
              ${
                error
                  ? "border-red-700 bg-red-950/20 focus:ring-red-500"
                  : "focus:ring-blue-500"
              }
              focus:outline-none focus:ring-2
            `}
          />
        </div>
      </div>

      {/* Error Message */}
      {error && errorRecovery && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 space-y-1">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-red-200">{errorRecovery.message}</p>
              <p className="mt-1 text-xs text-red-300">{errorRecovery.remediation}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-green-900 bg-green-950/30 p-3">
          <CheckCircle size={16} className="text-green-400 shrink-0 mt-0.5" />
          <p className="text-sm text-green-200">{success}</p>
        </div>
      )}

      {/* Provider List */}
      <div>
        <label className="mb-3 block text-xs font-medium uppercase tracking-wide text-neutral-400">
          {filteredProviders.length > 0
            ? `Available Providers (${filteredProviders.length})`
            : "No providers found"}
        </label>

        {filteredProviders.length === 0 ? (
          <div className="rounded-lg border border-neutral-700 bg-neutral-950/50 p-6 text-center">
            <p className="text-sm text-neutral-400">
              {searchQuery
                ? "No providers match your search"
                : "No providers available"}
            </p>
          </div>
        ) : (
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950/40 p-1">
            {filteredProviders.map((option) => (
              <button
                key={option.entry.providerId}
                onClick={() => handleSelectProvider(option.entry.providerId)}
                type="button"
                disabled={isConnecting}
                className={`
                  w-full rounded-md px-3 py-2.5 text-left
                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  ${
                    selectedProviderId === option.entry.providerId
                      ? "bg-neutral-800 ring-1 ring-blue-500/60"
                      : "hover:bg-neutral-800/70"
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-100">
                      {option.displayName}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      {option.description}
                    </p>
                  </div>
                  {selectedProviderId === option.entry.providerId && (
                    <div className="ml-2 text-blue-400">✓</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* API Key Form */}
      {selectedProvider && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 border-t border-neutral-700 pt-4"
        >
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-200">
              API Key for {selectedProvider.displayName}
            </label>

            {/* Key Format Hint */}
            {selectedProvider.keyFormat?.description && (
              <p className="mb-2 text-xs text-neutral-400">
                {selectedProvider.keyFormat.description}
              </p>
            )}

            <input
              type="password"
              value={apiSecret}
              onChange={(e) => {
                setApiSecret(e.target.value);
                if (onErrorClear) {
                  onErrorClear();
                }
              }}
              placeholder={
                selectedProvider.keyFormat?.prefix
                  ? `e.g., ${selectedProvider.keyFormat.prefix}...`
                  : "Enter your API key"
              }
              required
              disabled={isConnecting}
              className={`
                w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  error
                    ? "border-red-700 bg-red-950/20"
                    : ""
                }
                focus:outline-none focus:ring-2 focus:ring-blue-500
              `}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-200">
              Label (optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., 'Personal', 'Work', 'Team'"
              disabled={isConnecting}
              className={`
                w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-blue-500
              `}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isConnecting || !apiSecret.trim()}
              className={`
                flex-1 px-4 py-2 rounded-lg font-medium text-sm
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  isConnecting || !apiSecret.trim()
                    ? "bg-neutral-700 text-neutral-400"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }
              `}
            >
              {isConnecting ? "Connecting..." : "Connect Provider"}
            </button>
          </div>
        </form>
      )}

      {/* No provider selected message */}
      {!selectedProvider && (
        <div className="rounded-lg border border-blue-900 bg-blue-950/30 p-4 text-center">
          <p className="text-sm text-blue-200">
            Select a provider above to enter your API key
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Build provider description from entry
 */
function buildProviderDescription(entry: ProviderRegistryEntry): string {
  const capabilities = [];

  if (entry.capabilities.streaming) {
    capabilities.push("Streaming");
  }
  if (entry.capabilities.tools) {
    capabilities.push("Tools");
  }
  if (entry.capabilities.jsonMode) {
    capabilities.push("JSON");
  }

  const capabilityText = capabilities.length > 0 ? capabilities.join(", ") : "Basic";
  return capabilityText;
}
