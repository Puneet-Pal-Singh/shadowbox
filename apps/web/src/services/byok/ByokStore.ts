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
import { ByokApiClient } from "../api/byokClient.js";

/**
 * Store state shape
 */
export interface ByokStoreState {
  // Data
  catalog: ProviderRegistryEntry[];
  credentials: BYOKCredential[];
  preferences: BYOKPreference | null;

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
 * Store initialization options
 */
export interface ByokStoreOptions {
  apiClient?: ByokApiClient;
  enableLogging?: boolean;
}

/**
 * ByokStore - Manages all BYOK state and operations
 */
export class ByokStore {
  private static instance: ByokStore;
  private state: ByokStoreState;
  private apiClient: ByokApiClient;
  private listeners: Set<(state: ByokStoreState) => void> = new Set();
  private inflight: Map<string, Promise<unknown>> = new Map();
  private enableLogging: boolean;

  private constructor(apiClient: ByokApiClient, enableLogging = false) {
    this.apiClient = apiClient;
    this.enableLogging = enableLogging;
    this.state = {
      catalog: [],
      credentials: [],
      preferences: null,
      selectedProviderId: null,
      selectedCredentialId: null,
      selectedModelId: null,
      lastResolvedConfig: null,
      status: "idle",
      error: null,
      isValidating: false,
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

    if (this.state.status === "loading") {
      this.log("[bootstrap] Already loading, skipping");
      return;
    }

    this.setState({ status: "loading", error: null });

    try {
      const [catalog, credentials, preferences] = await Promise.all([
        this.apiClient.getCatalog(),
        this.apiClient.getCredentials(),
        this.apiClient.getPreferences(),
      ]);

      this.setState({
        catalog,
        credentials,
        preferences,
        status: "ready",
      });

      this.log("[bootstrap] Success", {
        providers: catalog.length,
        credentials: credentials.length,
      });
    } catch (error) {
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

    try {
      const credential = await this.apiClient.connectCredential(req);

      // Add to credentials list
      this.setState({
        credentials: [...this.state.credentials, credential],
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

    try {
      await this.apiClient.disconnectCredential(credentialId);

      // Remove from credentials list
      this.setState({
        credentials: this.state.credentials.filter(
          (c) => c.credentialId !== credentialId
        ),
        // Clear selection if it was the disconnected credential
        selectedCredentialId:
          this.state.selectedCredentialId === credentialId
            ? null
            : this.state.selectedCredentialId,
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

    try {
      await this.apiClient.validateCredential(credentialId, { mode });

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

  /**
   * Internal preferences update implementation
   */
  private async executeUpdatePreferences(
    partial: Partial<BYOKPreference>
  ): Promise<void> {
    this.log("[updatePreferences] Starting", partial);

    try {
      const updated = await this.apiClient.updatePreferences(partial);

      this.setState({
        preferences: updated,
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
    const key = "resolve";

    if (this.inflight.has(key)) {
      this.log("[resolveForChat] Request already in flight");
      await this.inflight.get(key);
      return this.state.lastResolvedConfig!;
    }

    const promise = this.executeResolve();
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
  private async executeResolve(): Promise<void> {
    this.log("[resolveForChat] Starting");

    try {
      const config = await this.apiClient.resolveForChat({
        providerId: this.state.selectedProviderId || undefined,
        credentialId: this.state.selectedCredentialId || undefined,
        modelId: this.state.selectedModelId || undefined,
      });

      this.setState({
        lastResolvedConfig: config,
      });

      this.log("[resolveForChat] Success", {
        providerId: config.providerId,
        modelId: config.modelId,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to resolve provider configuration";
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
    this.state = {
      catalog: [],
      credentials: [],
      preferences: null,
      selectedProviderId: null,
      selectedCredentialId: null,
      selectedModelId: null,
      lastResolvedConfig: null,
      status: "idle",
      error: null,
      isValidating: false,
    };
    this.emit();
  }

  /**
   * Internal state setter with notification
   */
  private setState(partial: Partial<ByokStoreState>): void {
    this.state = { ...this.state, ...partial };
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
}
