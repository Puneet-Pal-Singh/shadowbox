/**
 * Unified Provider Dialog Component
 *
 * Single provider/credential/model UI surface used in settings and composer.
 * Replaces duplicate provider selectors throughout the app.
 *
 * Tabs:
 * - Connected: Active credentials by provider
 * - Available: Add new credentials
 * - Preferences: Default selection + fallback policy
 * - Session: Quick-switch for current chat session
 */

import React, { useEffect, useState, useRef } from "react";
import { useProviderStore } from "../../hooks/useProviderStore.js";
import {
  BYOKCredential as ProviderCredential,
  BYOKPreference as ProviderPreference,
  ProviderRegistryEntry,
} from "@repo/shared-types";
import { type ProviderModelOption } from "../../services/api/providerClient.js";
import { getProviderRecoveryAdvice } from "../../lib/provider-recovery.js";
import { ConnectProviderChooser } from "./ConnectProviderChooser.js";
import { ManageModelsDialog } from "./ManageModelsDialog.js";

/**
 * Provider Dialog Props
 */
export interface ProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: "settings" | "composer";
  initialView?: "default" | "manage-models";
}

type ProviderDialogTabId =
  | "connected"
  | "available"
  | "preferences"
  | "session";

const PROVIDER_DIALOG_TAB_ORDER: ProviderDialogTabId[] = [
  "connected",
  "available",
  "preferences",
  "session",
];

/**
 * ProviderDialog Component
 */
export function ProviderDialog({
  isOpen,
  onClose,
  mode = "settings",
  initialView = "default",
}: ProviderDialogProps): React.ReactElement | null {
  const {
    catalog,
    credentials,
    providerModels,
    visibleModelIds,
    loadingModelsForProviderId,
    preferences,
    selectedProviderId,
    selectedCredentialId,
    selectedModelId,
    status,
    error,
    connectCredential,
    disconnectCredential,
    validateCredential,
    loadProviderModels,
    updatePreferences,
    applySessionSelection,
    toggleModelVisibility,
  } = useProviderStore();

  const [activeTab, setActiveTab] = useState<ProviderDialogTabId>(
    mode === "composer" ? "session" : "connected"
  );

  const [validatingCredentialId, setValidatingCredentialId] = useState<
    string | null
  >(null);

  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showManageModels, setShowManageModels] = useState(false);
  const tabButtonRefs = useRef<Map<ProviderDialogTabId, HTMLButtonElement>>(
    new Map()
  );

  useEffect(() => {
    if (!isOpen) {
      setActiveTab(mode === "composer" ? "session" : "connected");
      setConnectError(null);
      setConnectSuccess(null);
      setIsConnecting(false);
      setShowManageModels(false);
    }
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (initialView === "manage-models") {
      setShowManageModels(true);
    }
  }, [initialView, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  /**
   * Core credential connection logic (extracted for reuse)
   */
  const doConnect = async (
    providerId: string,
    secret: string,
    labelValue: string
  ): Promise<void> => {
    setConnectError(null);
    setConnectSuccess(null);

    if (!providerId || !secret) {
      setConnectError("Provider and API key are required");
      return;
    }

    setIsConnecting(true);

    try {
      await connectCredential({
        providerId,
        secret,
        label: labelValue || undefined,
      });

      setConnectSuccess("API key saved and provider connected.");
      setActiveTab("connected");
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : "Failed to connect credential"
      );
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Handle credential validation
   */
  const handleValidate = async (
    credentialId: string,
    mode: "format" | "live"
  ) => {
    setValidatingCredentialId(credentialId);

    try {
      await validateCredential(credentialId, mode);
    } catch {
      // Error handled by store
    } finally {
      setValidatingCredentialId(null);
    }
  };

  /**
   * Handle preference update
   */
  const handleUpdatePreferences = async (
    partial: Partial<ProviderPreference>
  ) => {
    try {
      await updatePreferences(partial);
    } catch {
      // Error handled by store
    }
  };

  /**
   * Handle selection change (session tab)
   */
  const handleSessionSelect = async (
    providerId: string,
    credentialId: string,
    modelId?: string
  ) => {
    if (!credentialId) {
      return;
    }

    const resolvedModelId =
      modelId ??
      providerModels[providerId]?.[0]?.id ??
      catalog.find((entry) => entry.providerId === providerId)?.defaultModelId;
    try {
      await applySessionSelection({
        providerId,
        credentialId,
        modelId: resolvedModelId,
      });
    } catch {
      // Error shown in UI
    }
  };

  const selectedProviderModelOptions = selectedProviderId
    ? providerModels[selectedProviderId] ?? []
    : [];
  const isSelectedProviderModelLoading =
    loadingModelsForProviderId !== null &&
    loadingModelsForProviderId === selectedProviderId;
  const statusRecovery = getProviderRecoveryAdvice(error);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-dialog-title"
        className="bg-white rounded-lg shadow-lg w-full max-w-2xl h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="border-b px-4 sm:px-6 py-4 flex items-center justify-between">
          <h2 id="provider-dialog-title" className="text-lg font-semibold">
            Provider & Model Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b flex gap-1 px-2 sm:px-6 overflow-x-auto" role="tablist">
          {PROVIDER_DIALOG_TAB_ORDER.map((tabId, index) => {
            const label =
              tabId === "session"
                ? mode === "composer"
                  ? "Active Session"
                  : "Quick Select"
                : tabId.charAt(0).toUpperCase() + tabId.slice(1);
            return (
            <button
              key={tabId}
              ref={(el) => {
                if (el) {
                  tabButtonRefs.current.set(tabId, el);
                } else {
                  tabButtonRefs.current.delete(tabId);
                }
              }}
              id={`provider-tab-${tabId}`}
              onClick={() => setActiveTab(tabId)}
              onKeyDown={(e) => {
                let nextIndex = index;
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  nextIndex = (index + 1) % PROVIDER_DIALOG_TAB_ORDER.length;
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  nextIndex =
                    (index - 1 + PROVIDER_DIALOG_TAB_ORDER.length) %
                    PROVIDER_DIALOG_TAB_ORDER.length;
                }
                const nextTabId = PROVIDER_DIALOG_TAB_ORDER[nextIndex];
                if (nextTabId) {
                  setActiveTab(nextTabId);
                  tabButtonRefs.current.get(nextTabId)?.focus();
                }
              }}
              role="tab"
              aria-selected={activeTab === tabId}
              aria-controls={`provider-panel-${tabId}`}
              tabIndex={activeTab === tabId ? 0 : -1}
              className={`px-3 sm:px-4 py-3 border-b-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap ${
                activeTab === tabId
                  ? "border-blue-500 text-blue-600 font-medium"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {label}
            </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {status === "error" && error && (
            <div className="bg-red-50 border-b border-red-200 px-4 sm:px-6 py-3 text-red-700 text-sm space-y-1">
              <p>{statusRecovery.message}</p>
              <p className="text-xs text-red-600">{statusRecovery.remediation}</p>
            </div>
          )}

          {activeTab === "connected" && (
            <div
              role="tabpanel"
              id="provider-panel-connected"
              aria-labelledby="provider-tab-connected"
            >
              <ConnectedTab
                credentials={credentials}
                onDisconnect={disconnectCredential}
                onValidate={handleValidate}
                validatingId={validatingCredentialId}
                onOpenAvailableTab={() => setActiveTab("available")}
              />
            </div>
          )}

          {activeTab === "available" && (
            <div
              role="tabpanel"
              id="provider-panel-available"
              aria-labelledby="provider-tab-available"
              className="p-4 sm:p-6"
            >
              <ConnectProviderChooser
                catalog={catalog}
                error={connectError}
                success={connectSuccess}
                isConnecting={isConnecting}
                onConnect={async (providerId, secret, label) => {
                  await doConnect(providerId, secret, label || "");
                }}
                onErrorClear={() => setConnectError(null)}
              />
            </div>
          )}

          {activeTab === "preferences" && (
            <div
              role="tabpanel"
              id="provider-panel-preferences"
              aria-labelledby="provider-tab-preferences"
            >
              <PreferencesTab
                preferences={preferences}
                onUpdate={handleUpdatePreferences}
              />
            </div>
          )}

          {activeTab === "session" && (
            <div
              role="tabpanel"
              id="provider-panel-session"
              aria-labelledby="provider-tab-session"
            >
              <SessionTab
                catalog={catalog}
                credentials={credentials}
                selectedProviderId={selectedProviderId}
                selectedCredentialId={selectedCredentialId}
                selectedModelId={selectedModelId}
                modelOptions={selectedProviderModelOptions}
                isModelLoading={isSelectedProviderModelLoading}
                onLoadModels={loadProviderModels}
                onSelect={handleSessionSelect}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 sm:px-6 py-3 flex justify-between gap-3">
          <button
            onClick={() => setShowManageModels(true)}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition"
          >
            Manage Models
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Manage Models Dialog */}
      <ManageModelsDialog
        isOpen={showManageModels}
        onClose={() => setShowManageModels(false)}
        catalog={catalog}
        providerModels={providerModels}
        visibleModelIds={visibleModelIds}
        onToggleModelVisibility={toggleModelVisibility}
        isLoading={loadingModelsForProviderId !== null}
      />
    </div>
  );
}

/**
 * Connected Tab - List of active credentials
 */
function ConnectedTab({
  credentials,
  onDisconnect,
  onValidate,
  validatingId,
  onOpenAvailableTab,
}: {
  credentials: ProviderCredential[];
  onDisconnect: (id: string) => Promise<void>;
  onValidate: (id: string, mode: "format" | "live") => Promise<void>;
  validatingId: string | null;
  onOpenAvailableTab: () => void;
}): React.ReactElement {
  return (
    <div className="p-6">
      {credentials.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <p className="text-gray-500">
            No provider keys connected yet.
          </p>
          <button
            type="button"
            onClick={onOpenAvailableTab}
            className="text-sm px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            Add Provider Key
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {credentials.map((cred) => (
            <div
              key={cred.credentialId}
              className="border rounded-lg p-4 hover:bg-gray-50 transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">
                    {cred.label || `${cred.providerId} (default)`}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Provider: {cred.providerId}
                  </p>
                  {cred.keyFingerprint && (
                    <p className="text-xs text-gray-500 mt-1">
                      Fingerprint: {cred.keyFingerprint.slice(0, 16)}...
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        cred.status === "connected"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {cred.status}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => onValidate(cred.credentialId, "format")}
                    disabled={validatingId === cred.credentialId}
                    className="text-sm px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 transition"
                  >
                    {validatingId === cred.credentialId ? "Validating..." : "Test"}
                  </button>
                  <button
                    onClick={() => onDisconnect(cred.credentialId)}
                    className="text-sm px-3 py-1 border border-red-300 text-red-700 rounded hover:bg-red-50 transition"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Preferences Tab - Default selection + fallback policy
 */
function PreferencesTab({
  preferences,
  onUpdate,
}: {
  preferences: ProviderPreference | null;
  onUpdate: (partial: Partial<ProviderPreference>) => Promise<void>;
}): React.ReactElement {
  const fallbackMode = preferences?.fallbackMode || "strict";

  const handleFallbackChange = async (
    mode: "strict" | "allow_fallback"
  ) => {
    await onUpdate({ fallbackMode: mode });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="font-medium mb-3">Fallback Policy</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={fallbackMode === "strict"}
              onChange={() => handleFallbackChange("strict")}
              className="w-4 h-4"
            />
            <span className="text-sm">
              <strong>Strict</strong> - Use selected provider only
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={fallbackMode === "allow_fallback"}
              onChange={() => handleFallbackChange("allow_fallback")}
              className="w-4 h-4"
            />
            <span className="text-sm">
              <strong>Allow Fallback</strong> - Use platform default if
              selected provider fails
            </span>
          </label>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-900">
        {fallbackMode === "strict"
          ? "Only your selected provider will be used. If it fails, chat requests will error."
          : "If your selected provider is unavailable, we'll fall back to the platform default provider automatically."}
      </div>
    </div>
  );
}

/**
 * Session Tab - Quick select for current chat
 */
function SessionTab({
  catalog,
  credentials,
  selectedProviderId,
  selectedCredentialId,
  selectedModelId,
  modelOptions,
  isModelLoading,
  onLoadModels,
  onSelect,
}: {
  catalog: ProviderRegistryEntry[];
  credentials: ProviderCredential[];
  selectedProviderId: string | null;
  selectedCredentialId: string | null;
  selectedModelId: string | null;
  modelOptions: ProviderModelOption[];
  isModelLoading: boolean;
  onLoadModels: (providerId: string) => Promise<ProviderModelOption[]>;
  onSelect: (providerId: string, credentialId: string, modelId?: string) => void;
}): React.ReactElement {
  const availableProviders = catalog.filter((p) =>
    credentials.some((c) => c.providerId === p.providerId)
  );
  const providerCredentials = selectedProviderId
    ? credentials.filter((credential) => credential.providerId === selectedProviderId)
    : [];
  const canSelectModel = Boolean(selectedProviderId && selectedCredentialId);
  const handleModelSelection = (modelId: string): void => {
    if (!selectedProviderId || !selectedCredentialId) {
      return;
    }
    onSelect(selectedProviderId, selectedCredentialId, modelId);
  };

  useEffect(() => {
    if (!selectedProviderId) {
      return;
    }
    void onLoadModels(selectedProviderId);
  }, [onLoadModels, selectedProviderId]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Provider</label>
        <select
          value={selectedProviderId || ""}
          onChange={(e) => {
            const provider = e.target.value;
            const cred = credentials.find((c) => c.providerId === provider);
            if (cred) {
              onSelect(provider, cred.credentialId);
              void onLoadModels(provider);
            }
          }}
          className="w-full border rounded px-3 py-2 text-sm"
        >
          <option value="">Select a provider...</option>
          {availableProviders.map((p) => (
            <option key={p.providerId} value={p.providerId}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>

      {selectedProviderId && (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">Credential</label>
            <select
              value={selectedCredentialId || ""}
              onChange={(e) => {
                 const credId = e.target.value;
                 const cred = credentials.find((c) => c.credentialId === credId);
                 if (cred) {
                   onSelect(selectedProviderId, credId);
                 }
               }}
               className="w-full border rounded px-3 py-2 text-sm"
              >
               {providerCredentials.map((c) => (
                   <option key={c.credentialId} value={c.credentialId}>
                     {c.label || "Default"}
                   </option>
                 ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Model</label>
            {modelOptions.length > 0 ? (
              <select
                value={selectedModelId || ""}
                onChange={(e) => handleModelSelection(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                disabled={!canSelectModel}
              >
                <option value="">Select a model...</option>
                {modelOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.id})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedModelId || ""}
                onChange={(e) => handleModelSelection(e.target.value)}
                placeholder="e.g., gpt-4, claude-3-opus"
                className="w-full border rounded px-3 py-2 text-sm"
                disabled={!canSelectModel}
              />
            )}
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                {!canSelectModel
                  ? "Select a credential before choosing a model."
                  : modelOptions.length > 0
                  ? "Models fetched from provider."
                  : "No fetched models yet. You can type one manually or refresh."}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (selectedProviderId) {
                    void onLoadModels(selectedProviderId);
                  }
                }}
                disabled={isModelLoading}
                className="text-xs text-blue-700 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {isModelLoading ? "Loading..." : "Refresh models"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
