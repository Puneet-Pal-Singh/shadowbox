/**
 * useProviderStore Hook
 *
 * React hook for consuming provider store state and actions.
 * Automatically initializes store on first use and subscribes to updates.
 *
 * Usage:
 *   const { credentials, connectCredential } = useProviderStore();
 *   
 *   useEffect(() => {
 *     if (credentials.length === 0) {
 *       store.bootstrap();
 *     }
 *   }, []);
 */

import { useEffect, useState, useCallback } from "react";
import {
  ProviderStore,
  ProviderStoreState,
  ConnectCredentialRequest,
  SessionSelectionRequest,
} from "../services/provider/ProviderStore.js";
import {
  BYOKPreference as ProviderPreference,
  BYOKResolution as ProviderResolution,
} from "@repo/shared-types";
import type { ProviderModelOption } from "../services/api/providerClient.js";
import { useRunContext } from "./useRunContext";

/**
 * useProviderStore Hook
 *
 * Returns current store state and bound action methods.
 * Automatically subscribes to state changes.
 */
type UseProviderStoreResult = ProviderStoreState & {
  bootstrap: () => Promise<void>;
  connectCredential: (req: ConnectCredentialRequest) => Promise<void>;
  disconnectCredential: (credentialId: string) => Promise<void>;
  validateCredential: (
    credentialId: string,
    mode: "format" | "live"
  ) => Promise<void>;
  loadProviderModels: (providerId: string) => Promise<ProviderModelOption[]>;
  updatePreferences: (
    partial: Partial<ProviderPreference>
  ) => Promise<void>;
  setSelection: (
    providerId: string,
    credentialId: string,
    modelId?: string
  ) => void;
  applySessionSelection: (
    request: SessionSelectionRequest,
  ) => Promise<ProviderResolution>;
  resolveForChat: () => Promise<ProviderResolution>;
  toggleModelVisibility: (providerId: string, modelId: string) => void;
  setProviderVisibleModels: (providerId: string, modelIds: string[]) => void;
  clearError: () => void;
  reset: () => void;
};

export function useProviderStore(
  runIdOverride?: string,
): UseProviderStoreResult {
  const store = ProviderStore.getInstance();
  const { runId: contextRunId } = useRunContext();
  const runId = runIdOverride ?? contextRunId;
  const [state, setState] = useState<ProviderStoreState>(store.getState());

  useEffect(() => {
    // Subscribe to store changes
    const unsubscribe = store.subscribe((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, [store]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    store.setActiveRunId(runId);

    if (state.status === "idle") {
      store.bootstrap().catch((error) => {
        console.error("[provider/store] bootstrap failed", error);
      });
    }
  }, [runId, state.status, store]);

  const bootstrap = useCallback(() => store.bootstrap(), [store]);
  const connectCredential = useCallback(
    (req: ConnectCredentialRequest) => store.connectCredential(req),
    [store]
  );
  const disconnectCredential = useCallback(
    (credentialId: string) => store.disconnectCredential(credentialId),
    [store]
  );
  const validateCredential = useCallback(
    (credentialId: string, mode: "format" | "live") =>
      store.validateCredential(credentialId, mode),
    [store]
  );
  const loadProviderModels = useCallback(
    (providerId: string) => store.loadProviderModels(providerId),
    [store]
  );
  const updatePreferences = useCallback(
    (partial: Partial<ProviderPreference>) => store.updatePreferences(partial),
    [store]
  );
  const setSelection = useCallback(
    (providerId: string, credentialId: string, modelId?: string) =>
      store.setSelection(providerId, credentialId, modelId),
    [store]
  );
  const applySessionSelection = useCallback(
    (request: SessionSelectionRequest) => store.applySessionSelection(request),
    [store],
  );
  const resolveForChat = useCallback(
    () => store.resolveForChat(),
    [store]
  );
  const toggleModelVisibility = useCallback(
    (providerId: string, modelId: string) =>
      store.toggleModelVisibility(providerId, modelId),
    [store]
  );
  const setProviderVisibleModels = useCallback(
    (providerId: string, modelIds: string[]) =>
      store.setProviderVisibleModels(providerId, modelIds),
    [store]
  );
  const clearError = useCallback(() => store.clearError(), [store]);
  const reset = useCallback(() => store.reset(), [store]);

  return {
    ...state,
    bootstrap,
    connectCredential,
    disconnectCredential,
    validateCredential,
    loadProviderModels,
    updatePreferences,
    setSelection,
    applySessionSelection,
    resolveForChat,
    toggleModelVisibility,
    setProviderVisibleModels,
    clearError,
    reset,
  };
}
