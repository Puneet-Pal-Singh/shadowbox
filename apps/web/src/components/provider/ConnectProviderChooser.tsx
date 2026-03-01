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
  const providerButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

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
  const focusProviderByIndex = (index: number): void => {
    const provider = filteredProviders[index];
    if (!provider) {
      return;
    }
    providerButtonRefs.current.get(provider.entry.providerId)?.focus();
  };

  const handleSelectProvider = (providerId: string): void => {
    setSelectedProviderId(providerId);
    // Clear any previous errors when selecting new provider
    if (onErrorClear) {
      onErrorClear();
    }
  };

  const handleProviderKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    providerId: string
  ): void => {
    if (filteredProviders.length === 0) {
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusProviderByIndex((index + 1) % filteredProviders.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusProviderByIndex(
          (index - 1 + filteredProviders.length) % filteredProviders.length
        );
        break;
      case "Home":
        e.preventDefault();
        focusProviderByIndex(0);
        break;
      case "End":
        e.preventDefault();
        focusProviderByIndex(filteredProviders.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        handleSelectProvider(providerId);
        break;
      case "Escape":
        e.preventDefault();
        searchInputRef.current?.focus();
        break;
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
    <div className="space-y-6">
      {/* Search Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Find Provider
        </label>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by provider name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`
              w-full pl-9 pr-3 py-2 rounded-lg border
              text-sm transition-colors
              ${
                error
                  ? "border-red-300 bg-red-50 focus:ring-red-500"
                  : "border-gray-300 bg-white focus:ring-blue-500"
              }
              focus:outline-none focus:ring-2
            `}
          />
        </div>
      </div>

      {/* Error Message */}
      {error && errorRecovery && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-red-700 font-medium">{errorRecovery.message}</p>
              <p className="text-red-600 text-xs mt-1">{errorRecovery.remediation}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
          <CheckCircle size={16} className="text-green-600 shrink-0 mt-0.5" />
          <p className="text-green-700 text-sm">{success}</p>
        </div>
      )}

      {/* Provider List */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          {filteredProviders.length > 0
            ? `Available Providers (${filteredProviders.length})`
            : "No providers found"}
        </label>

        {filteredProviders.length === 0 ? (
          <div className="p-6 text-center border border-gray-200 rounded-lg bg-gray-50">
            <p className="text-gray-600 text-sm">
              {searchQuery
                ? "No providers match your search"
                : "No providers available"}
            </p>
          </div>
        ) : (
          <div
            className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg"
            role="listbox"
            aria-label="Available providers"
          >
            {filteredProviders.map((option, index) => (
              <button
                key={option.entry.providerId}
                ref={(el) => {
                  if (el) {
                    providerButtonRefs.current.set(option.entry.providerId, el);
                  } else {
                    providerButtonRefs.current.delete(option.entry.providerId);
                  }
                }}
                onClick={() => handleSelectProvider(option.entry.providerId)}
                onKeyDown={(e) =>
                  handleProviderKeyDown(e, index, option.entry.providerId)
                }
                type="button"
                disabled={isConnecting}
                role="option"
                aria-selected={selectedProviderId === option.entry.providerId}
                tabIndex={
                  selectedProviderId === option.entry.providerId ||
                  (!selectedProviderId && index === 0)
                    ? 0
                    : -1
                }
                className={`
                  w-full text-left px-4 py-3 border-b last:border-b-0
                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  ${
                    selectedProviderId === option.entry.providerId
                      ? "bg-blue-50 border-l-4 border-l-blue-600"
                      : "hover:bg-gray-50"
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-900">
                      {option.displayName}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {option.description}
                    </p>
                  </div>
                  {selectedProviderId === option.entry.providerId && (
                    <div className="text-blue-600 ml-2">✓</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* API Key Form */}
      {selectedProvider && (
        <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key for {selectedProvider.displayName}
            </label>

            {/* Key Format Hint */}
            {selectedProvider.keyFormat?.description && (
              <p className="text-xs text-gray-600 mb-2">
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
                w-full px-3 py-2 rounded-lg border text-sm
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  error
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300 bg-white"
                }
                focus:outline-none focus:ring-2 focus:ring-blue-500
              `}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Label (optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., 'Personal', 'Work', 'Team'"
              disabled={isConnecting}
              className={`
                w-full px-3 py-2 rounded-lg border text-sm
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                border-gray-300 bg-white
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
                    ? "bg-gray-300 text-gray-600"
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
        <div className="p-4 text-center bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
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
