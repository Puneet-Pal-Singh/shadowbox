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

import React, { useEffect, useState } from "react";
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
}

/**
 * ProviderDialog Component
 */
export function ProviderDialog({
  isOpen,
  onClose,
  mode = "settings",
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

  const [activeTab, setActiveTab] = useState<
    "connected" | "available" | "preferences" | "session"
  >(mode === "composer" ? "session" : "connected");

  const [validatingCredentialId, setValidatingCredentialId] = useState<
    string | null
  >(null);

  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  const [showManageModels, setShowManageModels] = useState(false);

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Provider & Model Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b flex gap-1 px-6">
          {[
            { id: "connected", label: "Connected" },
            { id: "available", label: "Available" },
            { id: "preferences", label: "Preferences" },
            {
              id: "session",
              label: mode === "composer" ? "Active Session" : "Quick Select",
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(
                  tab.id as "connected" | "available" | "preferences" | "session"
                )
              }
              className={`px-4 py-3 border-b-2 transition ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600 font-medium"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {status === "error" && error && (
            <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-red-700 text-sm space-y-1">
              <p>{statusRecovery.message}</p>
              <p className="text-xs text-red-600">{statusRecovery.remediation}</p>
            </div>
          )}

          {activeTab === "connected" && (
            <ConnectedTab
              credentials={credentials}
              onDisconnect={disconnectCredential}
              onValidate={handleValidate}
              validatingId={validatingCredentialId}
              onOpenAvailableTab={() => setActiveTab("available")}
            />
          )}

          {activeTab === "available" && (
            <div className="p-6">
              <ConnectProviderChooser
                catalog={catalog}
                error={connectError}
                success={connectSuccess}
                isConnecting={false}
                onConnect={async (providerId, secret, label) => {
                  await doConnect(providerId, secret, label || "");
                }}
                onErrorClear={() => setConnectError(null)}
              />
            </div>
          )}

          {activeTab === "preferences" && (
            <PreferencesTab
              preferences={preferences}
              onUpdate={handleUpdatePreferences}
            />
          )}

          {activeTab === "session" && (
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
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 flex justify-between gap-3">
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
            {mode === "composer" && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded transition"
              >
                Use Selected
              </button>
            )}
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
               {credentials
                 .filter((c) => c.providerId === selectedProviderId)
                 .map((c) => (
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
                onChange={(e) =>
                  onSelect(
                    selectedProviderId,
                    selectedCredentialId || "",
                    e.target.value
                  )
                }
                className="w-full border rounded px-3 py-2 text-sm"
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
                onChange={(e) =>
                  onSelect(
                    selectedProviderId,
                    selectedCredentialId || "",
                    e.target.value
                  )
                }
                placeholder="e.g., gpt-4, claude-3-opus"
                className="w-full border rounded px-3 py-2 text-sm"
              />
            )}
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                {modelOptions.length > 0
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
                className="text-xs text-blue-700 hover:text-blue-800"
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
