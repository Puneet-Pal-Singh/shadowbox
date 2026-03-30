/**
 * Provider Store - Centralized State Management
 *
 * Single source of truth for provider credentials, preferences, and resolution.
 * Provides typed interface for all provider operations with built-in error handling and caching.
 *
 * Usage:
 *   const store = ProviderStore.getInstance();
 *   await store.bootstrap();
 *   const { credentials, preferences } = store.getState();
 */

import {
  BYOKResolution as ProviderResolution,
  BYOKCredential as ProviderCredential,
  BYOKPreference as ProviderPreference,
  type BYOKCredentialConnectRequest,
  type BYOKCredentialValidateRequest,
  type BYOKCredentialValidateResponse,
  type BYOKDiscoveredProviderModelsRefreshResponse,
  type BYOKPreferencesUpdateRequest,
  type BYOKResolveRequest,
  ProviderRegistryEntry,
} from "@repo/shared-types";
import {
  ProviderApiClient,
  type ProviderModelDiscoveryView,
  type ProviderModelOption,
  type ProviderModelsPageResult,
  type ProviderModelsQuery,
} from "../api/providerClient.js";

export interface ProviderModelsMetadataState {
  fetchedAt: string;
  stale: boolean;
  source: "provider_api" | "cache";
  staleReason?: string;
}

export interface ProviderModelsPageState {
  view: ProviderModelDiscoveryView;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ProviderAxisQuotaState {
  used: number;
  limit: number;
  resetsAt: string;
}

/**
 * Store state shape
 */
export interface ProviderStoreState {
  // Data
  catalog: ProviderRegistryEntry[];
  credentials: ProviderCredential[];
  preferences: ProviderPreference | null;
  providerModels: Record<string, ProviderModelOption[]>;
  providerModelsMetadata: Record<string, ProviderModelsMetadataState>;
  providerModelsPage: Record<string, ProviderModelsPageState>;
  visibleModelIds: Record<string, Set<string>>;

  // Current selection
  selectedProviderId: string | null;
  selectedCredentialId: string | null;
  selectedModelId: string | null;

  // Computed
  lastResolvedConfig: ProviderResolution | null;
  axisQuota?: ProviderAxisQuotaState | null;

  // Status tracking
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  isValidating: boolean;
  loadingModelsForProviderId: string | null;
  selectedModelView: ProviderModelDiscoveryView;
  refreshingModelsForProviderId: string | null;
}

interface ProviderSelectionSnapshot {
  selectedProviderId: string | null;
  selectedCredentialId: string | null;
  selectedModelId: string | null;
}

export type ConnectCredentialRequest = BYOKCredentialConnectRequest;
export type ValidateCredentialRequest = BYOKCredentialValidateRequest;

/**
 * API client contract for store operations.
 * Keeps store testable and decoupled from concrete client implementation.
 */
export interface ProviderApiClientContract {
  getCatalog(): Promise<ProviderRegistryEntry[]>;
  getProviderModels(
    providerId: string,
    query?: ProviderModelsQuery
  ): Promise<ProviderModelsPageResult>;
  refreshProviderModels(
    providerId: string
  ): Promise<BYOKDiscoveredProviderModelsRefreshResponse>;
  getCredentials(): Promise<ProviderCredential[]>;
  getPreferences(): Promise<ProviderPreference>;
  connectCredential(req: ConnectCredentialRequest): Promise<ProviderCredential>;
  disconnectCredential(credentialId: string): Promise<void>;
  validateCredential(
    credentialId: string,
    req: ValidateCredentialRequest
  ): Promise<BYOKCredentialValidateResponse>;
  updatePreferences(req: BYOKPreferencesUpdateRequest): Promise<ProviderPreference>;
  resolveForChat(req: BYOKResolveRequest): Promise<ProviderResolution>;
}

export interface SessionSelectionRequest {
  providerId: string;
  credentialId: string;
  modelId?: string;
}

export interface LoadProviderModelsOptions {
  view?: ProviderModelDiscoveryView;
  cursor?: string;
  limit?: number;
  append?: boolean;
}

interface ResolvedLoadProviderModelsOptions {
  view: ProviderModelDiscoveryView;
  cursor?: string;
  limit: number;
  append: boolean;
}

/**
 * Store initialization options
 */
export interface ProviderStoreOptions {
  apiClient?: ProviderApiClientContract;
  enableLogging?: boolean;
}

/**
 * ProviderStore - Manages all provider state and operations
 */
export class ProviderStore {
  private static instance: ProviderStore;
  private state: ProviderStoreState;
  private activeRunId: string | null = null;
  private apiClient: ProviderApiClientContract;
  private listeners: Set<(state: ProviderStoreState) => void> = new Set();
  private inflight: Map<string, Promise<unknown>> = new Map();
  private bootstrapPromise: Promise<void> | null = null;
  private lastResolveSelectionKey: string | null = null;
  private lastResolveError: Error | null = null;
  private epoch = 0;
  private enableLogging: boolean;

  private constructor(apiClient: ProviderApiClientContract, enableLogging = false) {
    this.apiClient = apiClient;
    this.enableLogging = enableLogging;
    this.state = {
      catalog: [],
      credentials: [],
      preferences: null,
      providerModels: {},
      providerModelsMetadata: {},
      providerModelsPage: {},
      visibleModelIds: {},
      selectedProviderId: null,
      selectedCredentialId: null,
      selectedModelId: null,
      lastResolvedConfig: null,
      axisQuota: null,
      status: "idle",
      error: null,
      isValidating: false,
      loadingModelsForProviderId: null,
      selectedModelView: "popular",
      refreshingModelsForProviderId: null,
    };
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(options?: ProviderStoreOptions): ProviderStore {
    if (!ProviderStore.instance) {
      const apiClient = options?.apiClient || new ProviderApiClient();
      ProviderStore.instance = new ProviderStore(
        apiClient,
        options?.enableLogging ?? false
      );
    }
    return ProviderStore.instance;
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
   * Get current state with deep-copied visibleModelIds to prevent mutations
   */
  getState(): ProviderStoreState {
    return {
      ...this.state,
      visibleModelIds: this.copyVisibleModelIds(this.state.visibleModelIds),
    };
  }

  /**
   * Deep copy visibleModelIds to prevent external mutations
   */
  private copyVisibleModelIds(
    visibleModelIds: Record<string, Set<string>>
  ): Record<string, Set<string>> {
    const copy: Record<string, Set<string>> = {};
    for (const [providerId, modelSet] of Object.entries(visibleModelIds)) {
      copy[providerId] = new Set(modelSet);
    }
    return copy;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: ProviderStoreState) => void): () => void {
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

      const visibleModelIds = this.hydrateVisibleModelIds(
        preferences,
        catalog
      );

      this.setState({
        catalog,
        credentials,
        preferences,
        visibleModelIds,
        selectedProviderId: selection.selectedProviderId,
        selectedCredentialId: selection.selectedCredentialId,
        selectedModelId: selection.selectedModelId,
        status: "ready",
      });

      const preloadProviderIds = this.collectBootstrapModelPreloadProviderIds(
        catalog,
        selection.selectedProviderId,
      );
      for (const providerId of preloadProviderIds) {
        if (this.state.providerModels[providerId]) {
          continue;
        }
        void this.loadProviderModels(providerId).catch((error) => {
          this.log("[bootstrap] model preload failed", {
            providerId,
            error,
          });
        });
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
        error instanceof Error ? error.message : "Failed to bootstrap provider state";
      this.setState({
        status: "error",
        error: message,
      });
      this.log("[bootstrap] Error", { error: message });
      throw error;
    }
  }

  /**
   * Hydrate visibility state from persisted preferences
   * Falls back to showing all models if preference is not set
   */
  private hydrateVisibleModelIds(
    preferences: ProviderPreference | null,
    catalog: ProviderRegistryEntry[]
  ): Record<string, Set<string>> {
    const result: Record<string, Set<string>> = {};

    if (!preferences?.visibleModelIds) {
      return result;
    }

    // Convert arrays from preference to Sets
    // Only add entries that exist in preferences (missing = show all)
    for (const [providerId, modelIds] of Object.entries(
      preferences.visibleModelIds
    )) {
      if (modelIds.length > 0) {
        result[providerId] = new Set(modelIds);
      }
    }

    return result;
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
    partial: BYOKPreferencesUpdateRequest
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

  async loadProviderModels(
    providerId: string,
    options: LoadProviderModelsOptions = {}
  ): Promise<ProviderModelOption[]> {
    const resolvedOptions = this.resolveLoadOptions(providerId, options);
    const key = [
      "models",
      providerId,
      resolvedOptions.view,
      resolvedOptions.cursor ?? "start",
      resolvedOptions.append ? "append" : "replace",
      resolvedOptions.limit,
    ].join(":");

    if (this.inflight.has(key)) {
      this.log("[loadProviderModels] Request already in flight", {
        providerId,
        ...resolvedOptions,
      });
      return (await this.inflight.get(key)) as ProviderModelOption[];
    }

    this.setState({ loadingModelsForProviderId: providerId });
    const promise = this.executeLoadProviderModels(
      providerId,
      resolvedOptions,
      this.epoch,
    );
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

  async loadMoreProviderModels(providerId: string): Promise<ProviderModelOption[]> {
    const pageState = this.state.providerModelsPage[providerId];
    if (!pageState?.hasMore || !pageState.nextCursor) {
      return this.state.providerModels[providerId] ?? [];
    }
    return this.loadProviderModels(providerId, {
      view: pageState.view,
      cursor: pageState.nextCursor,
      append: true,
    });
  }

  async refreshProviderModels(providerId: string): Promise<void> {
    const key = `refresh-models:${providerId}`;
    if (this.inflight.has(key)) {
      await this.inflight.get(key);
      return;
    }

    this.setState({ refreshingModelsForProviderId: providerId });
    const promise = this.executeRefreshProviderModels(providerId, this.epoch);
    this.inflight.set(key, promise);
    try {
      await promise;
    } finally {
      this.inflight.delete(key);
      if (this.state.refreshingModelsForProviderId === providerId) {
        this.setState({ refreshingModelsForProviderId: null });
      }
    }
  }

  async setModelView(view: ProviderModelDiscoveryView): Promise<void> {
    if (this.state.selectedModelView === view) {
      return;
    }
    this.setState({ selectedModelView: view });
    if (!this.state.selectedProviderId) {
      return;
    }
    await this.loadProviderModels(this.state.selectedProviderId, {
      view,
      append: false,
    });
  }

  private async executeLoadProviderModels(
    providerId: string,
    options: ResolvedLoadProviderModelsOptions,
    epoch: number
  ): Promise<ProviderModelOption[]> {
    this.log("[loadProviderModels] Starting", { providerId, ...options });
    const result = await this.apiClient.getProviderModels(providerId, {
      view: options.view,
      limit: options.limit,
      cursor: options.cursor,
    });
    if (this.isStaleEpoch("loadProviderModels", epoch)) {
      return result.models;
    }

    const currentModels = this.state.providerModels[providerId] ?? [];
    const mergedModels = options.append
      ? mergeModelsById(currentModels, result.models)
      : result.models;

    this.setState({
      providerModels: {
        ...this.state.providerModels,
        [providerId]: mergedModels,
      },
      providerModelsPage: {
        ...this.state.providerModelsPage,
        [providerId]: {
          view: result.view,
          hasMore: result.page.hasMore,
          nextCursor: result.page.nextCursor ?? null,
        },
      },
      providerModelsMetadata: {
        ...this.state.providerModelsMetadata,
        [providerId]: result.metadata,
      },
      selectedModelView: result.view,
      selectedModelId:
        this.state.selectedProviderId === providerId
          ? this.resolveSelectedModelId(this.state.selectedModelId, mergedModels)
          : this.state.selectedModelId,
    });
    this.log("[loadProviderModels] Success", {
      providerId,
      modelCount: mergedModels.length,
      view: result.view,
      hasMore: result.page.hasMore,
      stale: result.metadata.stale,
    });
    return mergedModels;
  }

  private async executeRefreshProviderModels(
    providerId: string,
    epoch: number
  ): Promise<void> {
    this.log("[refreshProviderModels] Starting", { providerId });
    await this.apiClient.refreshProviderModels(providerId);
    if (this.isStaleEpoch("refreshProviderModels", epoch)) {
      return;
    }
    await this.loadProviderModels(providerId, {
      view: this.state.selectedModelView,
      append: false,
    });
  }

  /**
   * Internal preferences update implementation
   */
  private async executeUpdatePreferences(
    partial: BYOKPreferencesUpdateRequest
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
   * Apply session selection through a single authoritative write path.
   * Updates selection and resolves runtime config in one operation.
   */
  async applySessionSelection(
    request: SessionSelectionRequest
  ): Promise<ProviderResolution> {
    this.setSelection(
      request.providerId,
      request.credentialId,
      request.modelId
    );
    await this.updatePreferences({
      defaultProviderId: request.providerId,
      ...(request.modelId ? { defaultModelId: request.modelId } : {}),
    });
    return this.resolveForChat();
  }

  /**
   * Resolve provider configuration for chat
   *
   * Returns the effective provider config based on selection and preferences.
   */
  async resolveForChat(): Promise<ProviderResolution> {
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
    selection: ProviderSelectionSnapshot,
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
        axisQuota:
          config.providerId === "axis" && config.quota
            ? {
                used: config.quota.used,
                limit: config.quota.limit,
                resetsAt: config.quota.resetsAt,
              }
            : null,
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
   * Toggle model visibility for a provider and persist to backend
   */
  toggleModelVisibility(providerId: string, modelId: string): void {
    const currentSet = this.state.visibleModelIds[providerId];
    let next: Set<string>;
    if (currentSet) {
      next = new Set(currentSet);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
    } else {
      // Provider was unconfigured (all visible). Initialize from loaded models
      // and remove the toggled model to transition into curated state.
      const allModelIds = (this.state.providerModels[providerId] ?? []).map(m => m.id);
      next = new Set(allModelIds);
      next.delete(modelId);
    }
    const newVisibleModelIds = {
      ...this.state.visibleModelIds,
      [providerId]: next,
    };
    this.setState({
      visibleModelIds: newVisibleModelIds,
    });
    // Persist changes to backend (fire and forget with error logging)
    this.persistVisibilityChanges(newVisibleModelIds).catch((error) => {
      this.log("[toggleModelVisibility] Failed to persist changes", {
        providerId,
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Set visible models for a provider and persist to backend
   */
  setProviderVisibleModels(providerId: string, modelIds: string[]): void {
    const newVisibleModelIds = {
      ...this.state.visibleModelIds,
      [providerId]: new Set(modelIds),
    };
    this.setState({
      visibleModelIds: newVisibleModelIds,
    });
    // Persist changes to backend (fire and forget with error logging)
    this.persistVisibilityChanges(newVisibleModelIds).catch((error) => {
      this.log("[setProviderVisibleModels] Failed to persist changes", {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Persist visibility changes to backend
   * Converts Sets to arrays for API payload
   */
  private async persistVisibilityChanges(
    visibleModelIds: Record<string, Set<string>>
  ): Promise<void> {
    // Convert Sets to arrays for API
    const visibleModelIdsRecord: Record<string, string[]> = {};
    for (const [providerId, modelSet] of Object.entries(visibleModelIds)) {
      visibleModelIdsRecord[providerId] = Array.from(modelSet);
    }

    await this.updatePreferences({
      visibleModelIds: visibleModelIdsRecord,
    });
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
      providerModelsMetadata: {},
      providerModelsPage: {},
      visibleModelIds: {},
      selectedProviderId: null,
      selectedCredentialId: null,
      selectedModelId: null,
      lastResolvedConfig: null,
      axisQuota: null,
      status: "idle",
      error: null,
      isValidating: false,
      loadingModelsForProviderId: null,
      selectedModelView: "popular",
      refreshingModelsForProviderId: null,
    };
    this.emit();
  }

  /**
   * Internal state setter with notification
   */
  private setState(partial: Partial<ProviderStoreState>): void {
    const shouldInvalidateResolution = this.shouldInvalidateResolution(partial);
    const nextPartial =
      shouldInvalidateResolution && partial.lastResolvedConfig === undefined
        ? { ...partial, lastResolvedConfig: null, axisQuota: null }
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
      console.log(`[ProviderStore] ${message}`, context);
    }
  }

  private shouldInvalidateResolution(partial: Partial<ProviderStoreState>): boolean {
    return (
      partial.catalog !== undefined ||
      partial.credentials !== undefined ||
      partial.preferences !== undefined ||
      partial.providerModels !== undefined ||
      partial.providerModelsMetadata !== undefined ||
      partial.providerModelsPage !== undefined ||
      partial.selectedProviderId !== undefined ||
      partial.selectedCredentialId !== undefined ||
      partial.selectedModelId !== undefined
    );
  }

  private buildResolveSelectionKey(selection: ProviderSelectionSnapshot): string {
    return [
      selection.selectedProviderId ?? "none",
      selection.selectedCredentialId ?? "none",
      selection.selectedModelId ?? "none",
    ].join("|");
  }

  private resolveLoadOptions(
    providerId: string,
    options: LoadProviderModelsOptions
  ): ResolvedLoadProviderModelsOptions {
    const pageState = this.state.providerModelsPage[providerId];
    return {
      view: options.view ?? pageState?.view ?? this.state.selectedModelView,
      cursor: options.cursor ?? undefined,
      limit: options.limit ?? 50,
      append: options.append ?? false,
    };
  }

  private resolveSelectedModelId(
    currentModelId: string | null,
    models: ProviderModelOption[]
  ): string | null {
    if (!currentModelId) {
      return models[0]?.id ?? null;
    }
    return models.some((model) => model.id === currentModelId)
      ? currentModelId
      : models[0]?.id ?? null;
  }

  private deriveSelectionSnapshot(input: {
    catalog: ProviderRegistryEntry[];
    credentials: ProviderCredential[];
    preferences: ProviderPreference | null;
    providerModels: Record<string, ProviderModelOption[]>;
    selectedProviderId: string | null;
    selectedCredentialId: string | null;
    selectedModelId: string | null;
  }): ProviderSelectionSnapshot {
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

  private collectBootstrapModelPreloadProviderIds(
    catalog: ProviderRegistryEntry[],
    selectedProviderId: string | null,
  ): string[] {
    const providerIds = new Set<string>();
    if (catalog.some((entry) => entry.providerId === "axis")) {
      providerIds.add("axis");
    }
    if (selectedProviderId) {
      providerIds.add(selectedProviderId);
    }
    return Array.from(providerIds);
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

function mergeModelsById(
  existingModels: ProviderModelOption[],
  nextModels: ProviderModelOption[]
): ProviderModelOption[] {
  if (existingModels.length === 0) {
    return [...nextModels];
  }
  const merged = [...existingModels];
  const knownIds = new Set(existingModels.map((model) => model.id));
  for (const model of nextModels) {
    if (knownIds.has(model.id)) {
      continue;
    }
    knownIds.add(model.id);
    merged.push(model);
  }
  return merged;
}
