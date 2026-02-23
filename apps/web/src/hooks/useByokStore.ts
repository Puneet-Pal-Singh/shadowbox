/**
 * useByokStore Hook
 *
 * React hook for consuming BYOK store state and actions.
 * Automatically initializes store on first use and subscribes to updates.
 *
 * Usage:
 *   const { credentials, connectCredential } = useByokStore();
 *   
 *   useEffect(() => {
 *     if (credentials.length === 0) {
 *       store.bootstrap();
 *     }
 *   }, []);
 */

import { useEffect, useState, useCallback } from "react";
import {
  ByokStore,
  ByokStoreState,
  ConnectCredentialRequest,
} from "../services/byok/ByokStore.js";
import { BYOKResolution } from "@repo/shared-types";

/**
 * useByokStore Hook
 *
 * Returns current store state and bound action methods.
 * Automatically subscribes to state changes.
 */
export function useByokStore(): ByokStoreState & {
  bootstrap: () => Promise<void>;
  connectCredential: (req: ConnectCredentialRequest) => Promise<void>;
  disconnectCredential: (credentialId: string) => Promise<void>;
  validateCredential: (
    credentialId: string,
    mode: "format" | "live"
  ) => Promise<void>;
  updatePreferences: (
    partial: Record<string, unknown>
  ) => Promise<void>;
  setSelection: (
    providerId: string,
    credentialId: string,
    modelId?: string
  ) => void;
  resolveForChat: () => Promise<BYOKResolution>;
  clearError: () => void;
  reset: () => void;
} {
  const store = ByokStore.getInstance();
  const [state, setState] = useState<ByokStoreState>(store.getState());

  useEffect(() => {
    // Subscribe to store changes
    const unsubscribe = store.subscribe((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, [store]);

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
  const updatePreferences = useCallback(
    (partial: Record<string, unknown>) => store.updatePreferences(partial),
    [store]
  );
  const setSelection = useCallback(
    (providerId: string, credentialId: string, modelId?: string) =>
      store.setSelection(providerId, credentialId, modelId),
    [store]
  );
  const resolveForChat = useCallback(
    () => store.resolveForChat(),
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
    updatePreferences,
    setSelection,
    resolveForChat,
    clearError,
    reset,
  };
}
