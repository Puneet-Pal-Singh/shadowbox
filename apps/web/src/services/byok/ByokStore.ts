/**
 * BYOK Store - Centralized State Management
 *
 * Single source of truth for BYOK provider credentials, preferences, and resolution.
 * Provides typed interface for all BYOK operations with built-in error handling and caching.
 *
 * Usage:
 *   const store = ByokStore.getInstance();
 *   await store.bootstrap();
 *   const { credentials, preferences } = store.getState();
 */

import {
  BYOKResolution,
  BYOKCredential,
  BYOKPreference,
  ProviderRegistryEntry,
} from "@repo/shared-types";
import {
  ByokApiClient,
  type ProviderModelOption,
} from "../api/byokClient.js";

/**
 * Store state shape
 */
export interface ByokStoreState {
  // Data
  catalog: ProviderRegistryEntry[];
  credentials: BYOKCredential[];
  preferences: BYOKPreference | null;
  providerModels: Record<string, ProviderModelOption[]>;

  // Current selection
  selectedProviderId: string | null;
  selectedCredentialId: string | null;
  selectedModelId: string | null;

  // Computed
  lastResolvedConfig: BYOKResolution | null;

  // Status tracking
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  isValidating: boolean;
  loadingModelsForProviderId: string | null;
}

interface ByokSelectionSnapshot {
  selectedProviderId: string | null;
  selectedCredentialId: string | null;
  selectedModelId: string | null;
}

/**
 * Connect credential request
 */
export interface ConnectCredentialRequest {
  providerId: string;
  secret: string;
  label?: string;
}

/**
 * Validate credential request
 */
export interface ValidateCredentialRequest {
  mode: "format" | "live";
}

/**
 * API client contract for store operations.
 * Keeps store testable and decoupled from concrete client implementation.
 */
export interface ByokApiClientContract {
  getCatalog(): Promise<ProviderRegistryEntry[]>;
  getProviderModels(providerId: string): Promise<ProviderModelOption[]>;
  getCredentials(): Promise<BYOKCredential[]>;
  getPreferences(): Promise<BYOKPreference>;
  connectCredential(req: ConnectCredentialRequest): Promise<BYOKCredential>;
  disconnectCredential(credentialId: string): Promise<void>;
  validateCredential(
    credentialId: string,
    req: ValidateCredentialRequest
  ): Promise<{ valid: boolean; error?: string }>;
  updatePreferences(req: Partial<BYOKPreference>): Promise<BYOKPreference>;
  resolveForChat(req: {
    providerId?: string;
    credentialId?: string;
    modelId?: string;
  }): Promise<BYOKResolution>;
}

/**
 * Store initialization options
 */
export interface ByokStoreOptions {
  apiClient?: ByokApiClientContract;
  enableLogging?: boolean;
}

/**
 * ByokStore - Manages all BYOK state and operations
 */
export class ByokStore {
  private static instance: ByokStore;
  private state: ByokStoreState;
  private activeRunId: string | null = null;
  private apiClient: ByokApiClientContract;
  private listeners: Set<(state: ByokStoreState) => void> = new Set();
  private inflight: Map<string, Promise<unknown>> = new Map();
  private bootstrapPromise: Promise<void> | null = null;
  private lastResolveSelectionKey: string | null = null;
  private lastResolveError: Error | null = null;
  private epoch = 0;
  private enableLogging: boolean;

  private constructor(apiClient: ByokApiClientContract, enableLogging = false) {
    this.apiClient = apiClient;
    this.enableLogging = enableLogging;
    this.state = {
      catalog: [],
      credentials: [],
      preferences: null,
      providerModels: {},
      selectedProviderId: null,
      selectedCredentialId: null,
      selectedModelId: null,
      lastResolvedConfig: null,
      status: "idle",
      error: null,
      isValidating: false,
      loadingModelsForProviderId: null,
    };
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(options?: ByokStoreOptions): ByokStore {
    if (!ByokStore.instance) {
      const apiClient = options?.apiClient || new ByokApiClient();
      ByokStore.instance = new ByokStore(
        apiClient,
        options?.enableLogging ?? false
      );
    }
    return ByokStore.instance;
  }

  /**
   * Bind store state to active run scope.
   * Resets store when run changes to prevent cross-run leakage.
   */
  setActiveRunId(runId: string): void {
    if (!runId || this.activeRunId === runId) {
      return;
    }

    const previousRunId = this.activeRunId;
    const didSwitchRun = previousRunId !== null && previousRunId !== runId;
    this.activeRunId = runId;

    if (didSwitchRun) {
      this.log("[run] switched active run, resetting store", {
        previousRunId,
        nextRunId: runId,
      });
      this.reset();
    }
  }

  /**
   * Get current state
   */
  getState(): ByokStoreState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: ByokStoreState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Bootstrap store: fetch catalog, credentials, preferences
   */
  async bootstrap(): Promise<void> {
    this.log("[bootstrap] Starting");

    if (this.bootstrapPromise) {
      this.log("[bootstrap] Request already in flight");
      await this.bootstrapPromise;
      return;
    }

    const epoch = this.epoch;
    const promise = this.executeBootstrap(epoch);
    this.bootstrapPromise = promise;
    try {
      await promise;
    } finally {
      if (this.bootstrapPromise === promise) {
        this.bootstrapPromise = null;
      }
    }
  }

  private async executeBootstrap(epoch: number): Promise<void> {
    this.setState({ status: "loading", error: null });
    try {
      const [catalog, credentials, preferences] = await Promise.all([
        this.apiClient.getCatalog(),
        this.apiClient.getCredentials(),
        this.apiClient.getPreferences(),
      ]);
      if (this.isStaleEpoch("bootstrap", epoch)) {
        return;
      }
      const selection = this.deriveSelectionSnapshot({
        catalog,
        credentials,
        preferences,
        providerModels: this.state.providerModels,
        selectedProviderId: this.state.selectedProviderId,
        selectedCredentialId: this.state.selectedCredentialId,
        selectedModelId: this.state.selectedModelId,
      });

      this.setState({
        catalog,
        credentials,
        preferences,
        selectedProviderId: selection.selectedProviderId,
        selectedCredentialId: selection.selectedCredentialId,
        selectedModelId: selection.selectedModelId,
        status: "ready",
      });

      if (
        selection.selectedProviderId &&
        !this.state.providerModels[selection.selectedProviderId]
      ) {
        void this.loadProviderModels(selection.selectedProviderId).catch(
          (error) => {
            this.log("[bootstrap] model preload failed", {
              providerId: selection.selectedProviderId,
              error,
            });
          }
        );
      }

      this.log("[bootstrap] Success", {
        providers: catalog.length,
        credentials: credentials.length,
      });
    } catch (error) {
      if (this.isStaleEpoch("bootstrap", epoch)) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Failed to bootstrap BYOK";
      this.setState({
        status: "error",
        error: message,
      });
      this.log("[bootstrap] Error", { error: message });
      throw error;
    }
  }

  /**
   * Connect a new credential
   */
  async connectCredential(req: ConnectCredentialRequest): Promise<void> {
    const key = `connect:${req.providerId}`;

    if (this.inflight.has(key)) {
      this.log("[connectCredential] Request already in flight");
      await this.inflight.get(key);
      return;
    }

    const promise = this.executeConnect(req);
    this.inflight.set(key, promise);

    try {
      await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  /**
   * Internal connect implementation
   */
  private async executeConnect(req: ConnectCredentialRequest): Promise<void> {
    this.log("[connectCredential] Starting", { providerId: req.providerId });
    const epoch = this.epoch;

    try {
      const credential = await this.apiClient.connectCredential(req);
      const preferences = await this.apiClient.getPreferences();
      if (this.isStaleEpoch("connectCredential", epoch)) {
        return;
      }

      let providerModels = this.state.providerModels;
      try {
        const models = await this.loadProviderModels(req.providerId);
        if (this.isStaleEpoch("connectCredential", epoch)) {
          return;
        }
        providerModels = {
          ...providerModels,
          [req.providerId]: models,
        };
      } catch (error) {
        this.log("[connectCredential] model preload failed", { error });
      }

      const defaultModelId =
        (preferences.defaultProviderId === req.providerId
          ? preferences.defaultModelId
          : undefined) ??
        providerModels[req.providerId]?.[0]?.id ??
        this.state.catalog.find((p) => p.providerId === req.providerId)
          ?.defaultModelId ??
        null;
      const currentCredentialIndex = this.state.credentials.findIndex(
        (existing) => existing.credentialId === credential.credentialId
      );
      const nextCredentials =
        currentCredentialIndex === -1
          ? [...this.state.credentials, credential]
          : this.state.credentials.map((existing) =>
              existing.credentialId === credential.credentialId
                ? credential
                : existing
            );
      const selection = this.deriveSelectionSnapshot({
        catalog: this.state.catalog,
        credentials: nextCredentials,
        preferences,
        providerModels,
        selectedProviderId: this.state.selectedProviderId ?? req.providerId,
        selectedCredentialId:
          this.state.selectedCredentialId ?? credential.credentialId,
        selectedModelId: this.state.selectedModelId ?? defaultModelId,
      });

      this.setState({
        credentials: nextCredentials,
        preferences,
        providerModels,
        selectedProviderId: selection.selectedProviderId,
        selectedCredentialId: selection.selectedCredentialId,
        selectedModelId: selection.selectedModelId,
      });

      this.log("[connectCredential] Success", {
        credentialId: credential.credentialId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to connect credential";
      this.log("[connectCredential] Error", { error: message });
      throw error;
    }
  }

  /**
   * Disconnect a credential
   */
  async disconnectCredential(credentialId: string): Promise<void> {
    const key = `disconnect:${credentialId}`;

    if (this.inflight.has(key)) {
      this.log("[disconnectCredential] Request already in flight");
      await this.inflight.get(key);
      return;
    }

    const promise = this.executeDisconnect(credentialId);
    this.inflight.set(key, promise);

    try {
      await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  /**
   * Internal disconnect implementation
   */
  private async executeDisconnect(credentialId: string): Promise<void> {
    this.log("[disconnectCredential] Starting", { credentialId });
    const epoch = this.epoch;

    try {
      await this.apiClient.disconnectCredential(credentialId);
      if (this.isStaleEpoch("disconnectCredential", epoch)) {
        return;
      }

      // Remove from credentials list
      const nextCredentials = this.state.credentials.filter(
        (credential) => credential.credentialId !== credentialId
      );
      const selection = this.deriveSelectionSnapshot({
        catalog: this.state.catalog,
        credentials: nextCredentials,
        preferences: this.state.preferences,
        providerModels: this.state.providerModels,
        selectedProviderId: this.state.selectedProviderId,
        selectedCredentialId:
          this.state.selectedCredentialId === credentialId
            ? null
            : this.state.selectedCredentialId,
        selectedModelId: this.state.selectedModelId,
      });
      this.setState({
        credentials: nextCredentials,
        selectedProviderId: selection.selectedProviderId,
        selectedCredentialId: selection.selectedCredentialId,
        selectedModelId: selection.selectedModelId,
      });

      this.log("[disconnectCredential] Success", { credentialId });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to disconnect credential";
      this.log("[disconnectCredential] Error", { error: message });
      throw error;
    }
  }

  /**
   * Validate a credential (format or live)
   */
  async validateCredential(
    credentialId: string,
    mode: "format" | "live"
  ): Promise<void> {
    const key = `validate:${credentialId}:${mode}`;

    if (this.inflight.has(key)) {
      this.log("[validateCredential] Request already in flight");
      await this.inflight.get(key);
      return;
    }

    this.setState({ isValidating: true });

    const promise = this.executeValidate(credentialId, mode);
    this.inflight.set(key, promise);

    try {
      await promise;
    } finally {
      this.inflight.delete(key);
      this.setState({ isValidating: false });
    }
  }

  /**
   * Internal validate implementation
   */
  private async executeValidate(
    credentialId: string,
    mode: "format" | "live"
  ): Promise<void> {
    this.log("[validateCredential] Starting", { credentialId, mode });
    const epoch = this.epoch;

    try {
      await this.apiClient.validateCredential(credentialId, { mode });
      if (this.isStaleEpoch("validateCredential", epoch)) {
        return;
      }

      // Update credential status if validation succeeded
      const credential = this.state.credentials.find(
        (c) => c.credentialId === credentialId
      );
      if (credential) {
        const updated = { ...credential, status: "connected" as const };
        this.setState({
          credentials: this.state.credentials.map((c) =>
            c.credentialId === credentialId ? updated : c
          ),
        });
      }

      this.log("[validateCredential] Success", { credentialId, mode });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Validation failed";
      this.log("[validateCredential] Error", { error: message });
      throw error;
    }
  }

  /**
   * Update workspace preferences
   */
  async updatePreferences(
    partial: Partial<BYOKPreference>
  ): Promise<void> {
    const key = "preferences";

    if (this.inflight.has(key)) {
      this.log("[updatePreferences] Request already in flight");
      await this.inflight.get(key);
      return;
    }

    const promise = this.executeUpdatePreferences(partial);
    this.inflight.set(key, promise);

    try {
      await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  async loadProviderModels(providerId: string): Promise<ProviderModelOption[]> {
    const key = `models:${providerId}`;

    if (this.inflight.has(key)) {
      this.log("[loadProviderModels] Request already in flight", { providerId });
      return (await this.inflight.get(key)) as ProviderModelOption[];
    }

    this.setState({ loadingModelsForProviderId: providerId });
    const promise = this.executeLoadProviderModels(providerId, this.epoch);
    this.inflight.set(key, promise);

    try {
      return (await promise) as ProviderModelOption[];
    } finally {
      this.inflight.delete(key);
      if (this.state.loadingModelsForProviderId === providerId) {
        this.setState({ loadingModelsForProviderId: null });
      }
    }
  }

  private async executeLoadProviderModels(
    providerId: string,
    epoch: number
  ): Promise<ProviderModelOption[]> {
    this.log("[loadProviderModels] Starting", { providerId });
    const models = await this.apiClient.getProviderModels(providerId);
    if (this.isStaleEpoch("loadProviderModels", epoch)) {
      return models;
    }

    this.setState({
      providerModels: {
        ...this.state.providerModels,
        [providerId]: models,
      },
      selectedModelId:
        this.state.selectedProviderId === providerId
          ? this.state.selectedModelId ?? models[0]?.id ?? null
          : this.state.selectedModelId,
    });
    this.log("[loadProviderModels] Success", {
      providerId,
      modelCount: models.length,
    });
    return models;
  }

  /**
   * Internal preferences update implementation
   */
  private async executeUpdatePreferences(
    partial: Partial<BYOKPreference>
  ): Promise<void> {
    this.log("[updatePreferences] Starting", partial);
    const epoch = this.epoch;

    try {
      const updated = await this.apiClient.updatePreferences(partial);
      if (this.isStaleEpoch("updatePreferences", epoch)) {
        return;
      }
      const selection = this.deriveSelectionSnapshot({
        catalog: this.state.catalog,
        credentials: this.state.credentials,
        preferences: updated,
        providerModels: this.state.providerModels,
        selectedProviderId: this.state.selectedProviderId,
        selectedCredentialId: this.state.selectedCredentialId,
        selectedModelId: this.state.selectedModelId,
      });

      this.setState({
        preferences: updated,
        selectedProviderId: selection.selectedProviderId,
        selectedCredentialId: selection.selectedCredentialId,
        selectedModelId: selection.selectedModelId,
      });

      this.log("[updatePreferences] Success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update preferences";
      this.log("[updatePreferences] Error", { error: message });
      throw error;
    }
  }

  /**
   * Set current provider/credential/model selection
   */
  setSelection(
    providerId: string,
    credentialId: string,
    modelId?: string
  ): void {
    this.log("[setSelection] Updating", {
      providerId,
      credentialId,
      modelId,
    });

    this.setState({
      selectedProviderId: providerId,
      selectedCredentialId: credentialId,
      selectedModelId: modelId || null,
    });
  }

  /**
   * Resolve provider configuration for chat
   *
   * Returns the effective provider config based on selection and preferences.
   */
  async resolveForChat(): Promise<BYOKResolution> {
    const selection = this.deriveSelectionSnapshot({
      catalog: this.state.catalog,
      credentials: this.state.credentials,
      preferences: this.state.preferences,
      providerModels: this.state.providerModels,
      selectedProviderId: this.state.selectedProviderId,
      selectedCredentialId: this.state.selectedCredentialId,
      selectedModelId: this.state.selectedModelId,
    });
    const selectionKey = this.buildResolveSelectionKey(selection);

    if (
      this.state.lastResolvedConfig &&
      this.lastResolveSelectionKey === selectionKey &&
      !this.lastResolveError
    ) {
      return this.state.lastResolvedConfig;
    }
    if (this.lastResolveError && this.lastResolveSelectionKey === selectionKey) {
      throw this.lastResolveError;
    }

    const key = "resolve";

    if (this.inflight.has(key)) {
      this.log("[resolveForChat] Request already in flight");
      await this.inflight.get(key);
      if (this.state.lastResolvedConfig) {
        return this.state.lastResolvedConfig;
      }
      throw new Error("Provider resolution failed.");
    }

    const promise = this.executeResolve(selection, selectionKey, this.epoch);
    this.inflight.set(key, promise);

    try {
      await promise;
      return this.state.lastResolvedConfig!;
    } finally {
      this.inflight.delete(key);
    }
  }

  /**
   * Internal resolve implementation
   */
  private async executeResolve(
    selection: ByokSelectionSnapshot,
    selectionKey: string,
    epoch: number
  ): Promise<void> {
    this.log("[resolveForChat] Starting");
    const request: {
      providerId?: string;
      credentialId?: string;
      modelId?: string;
    } = {};
    if (selection.selectedProviderId) {
      request.providerId = selection.selectedProviderId;
    }
    if (selection.selectedCredentialId) {
      request.credentialId = selection.selectedCredentialId;
    }
    if (selection.selectedModelId) {
      request.modelId = selection.selectedModelId;
    }

    try {
      const config = await this.apiClient.resolveForChat(request);
      if (this.isStaleEpoch("resolveForChat", epoch)) {
        return;
      }

      const normalizedCredentialId =
        config.credentialId.trim().length > 0 ? config.credentialId : null;

      this.setState({
        lastResolvedConfig: config,
        selectedProviderId: config.providerId,
        selectedCredentialId: normalizedCredentialId,
        selectedModelId: config.modelId,
      });
      this.lastResolveSelectionKey = selectionKey;
      this.lastResolveError = null;

      this.log("[resolveForChat] Success", {
        providerId: config.providerId,
        modelId: config.modelId,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to resolve provider configuration";
      this.lastResolveSelectionKey = selectionKey;
      this.lastResolveError =
        error instanceof Error ? error : new Error(message);
      this.log("[resolveForChat] Error", { error: message });
      throw error;
    }
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.setState({ error: null });
  }

  /**
   * Reset store to initial state
   */
  reset(): void {
    this.epoch += 1;
    this.inflight.clear();
    this.bootstrapPromise = null;
    this.lastResolveSelectionKey = null;
    this.lastResolveError = null;
    this.state = {
      catalog: [],
      credentials: [],
      preferences: null,
      providerModels: {},
      selectedProviderId: null,
      selectedCredentialId: null,
      selectedModelId: null,
      lastResolvedConfig: null,
      status: "idle",
      error: null,
      isValidating: false,
      loadingModelsForProviderId: null,
    };
    this.emit();
  }

  /**
   * Internal state setter with notification
   */
  private setState(partial: Partial<ByokStoreState>): void {
    const shouldInvalidateResolution = this.shouldInvalidateResolution(partial);
    const nextPartial =
      shouldInvalidateResolution && partial.lastResolvedConfig === undefined
        ? { ...partial, lastResolvedConfig: null }
        : partial;
    if (shouldInvalidateResolution) {
      this.lastResolveSelectionKey = null;
      this.lastResolveError = null;
    }
    this.state = { ...this.state, ...nextPartial };
    this.emit();
  }

  /**
   * Emit state change to all listeners
   */
  private emit(): void {
    this.listeners.forEach((listener) => listener(this.getState()));
  }

  /**
   * Internal logging helper
   */
  private log(message: string, context?: unknown): void {
    if (this.enableLogging) {
      console.log(`[ByokStore] ${message}`, context);
    }
  }

  private shouldInvalidateResolution(partial: Partial<ByokStoreState>): boolean {
    return (
      partial.catalog !== undefined ||
      partial.credentials !== undefined ||
      partial.preferences !== undefined ||
      partial.providerModels !== undefined ||
      partial.selectedProviderId !== undefined ||
      partial.selectedCredentialId !== undefined ||
      partial.selectedModelId !== undefined
    );
  }

  private buildResolveSelectionKey(selection: ByokSelectionSnapshot): string {
    return [
      selection.selectedProviderId ?? "none",
      selection.selectedCredentialId ?? "none",
      selection.selectedModelId ?? "none",
    ].join("|");
  }

  private deriveSelectionSnapshot(input: {
    catalog: ProviderRegistryEntry[];
    credentials: BYOKCredential[];
    preferences: BYOKPreference | null;
    providerModels: Record<string, ProviderModelOption[]>;
    selectedProviderId: string | null;
    selectedCredentialId: string | null;
    selectedModelId: string | null;
  }): ByokSelectionSnapshot {
    const {
      catalog,
      credentials,
      preferences,
      providerModels,
      selectedProviderId,
      selectedCredentialId,
      selectedModelId,
    } = input;
    const selectedCredential = selectedCredentialId
      ? credentials.find(
          (credential) => credential.credentialId === selectedCredentialId
        )
      : undefined;
    const hasSelectedProviderCredential = selectedProviderId
      ? credentials.some((credential) => credential.providerId === selectedProviderId)
      : false;

    const providerId =
      selectedCredential?.providerId ??
      (hasSelectedProviderCredential ? selectedProviderId : null) ??
      (preferences?.defaultProviderId &&
      credentials.some(
        (credential) => credential.providerId === preferences.defaultProviderId
      )
        ? preferences.defaultProviderId
        : null) ??
      credentials[0]?.providerId ??
      null;

    const providerCredentials = providerId
      ? credentials.filter((credential) => credential.providerId === providerId)
      : [];
    const credentialId =
      providerCredentials.find(
        (credential) => credential.credentialId === selectedCredentialId
      )?.credentialId ??
      (preferences?.defaultCredentialId &&
      providerCredentials.some(
        (credential) => credential.credentialId === preferences.defaultCredentialId
      )
        ? preferences.defaultCredentialId
        : null) ??
      providerCredentials[0]?.credentialId ??
      null;

    const selectedModelForProvider =
      providerId && selectedProviderId === providerId ? selectedModelId : null;
    const modelId =
      selectedModelForProvider ??
      (preferences?.defaultProviderId === providerId
        ? preferences.defaultModelId
        : undefined) ??
      (providerId ? providerModels[providerId]?.[0]?.id : undefined) ??
      (providerId
        ? catalog.find((entry) => entry.providerId === providerId)?.defaultModelId
        : undefined) ??
      null;

    return {
      selectedProviderId: providerId,
      selectedCredentialId: credentialId,
      selectedModelId: modelId,
    };
  }

  private isStaleEpoch(operation: string, epoch: number): boolean {
    if (epoch === this.epoch) {
      return false;
    }
    this.log(`[${operation}] skipping stale async result`, {
      operationEpoch: epoch,
      currentEpoch: this.epoch,
    });
    return true;
  }
}
