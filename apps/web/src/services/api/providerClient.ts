/**
 * Provider API Client v3
 *
 * Web-facing adapter that consumes the canonical provider SDK client.
 * Keeps backward-compatible method names for existing web store usage.
 */

import {
  createByokHttpTransport,
  createProviderClient,
  ProviderClientContractError,
  ProviderClientOperationError,
  type BYOKCredential,
  type BYOKCredentialConnectRequest,
  type BYOKCredentialUpdateRequest,
  type BYOKCredentialValidateRequest,
  type BYOKCredentialValidateResponse,
  type BYOKDiscoveredProviderModelsQuery,
  type BYOKDiscoveredProviderModelsRefreshResponse,
  type BYOKPreferencesUpdateRequest,
  type BYOKPreference,
  type BYOKResolution,
  type BYOKResolveRequest,
  type ProviderRegistryEntry,
} from "@repo/platform-client-sdk";
import type { BYOKModelDiscoverySource } from "@repo/shared-types";
import { getBrainHttpBase } from "../../lib/platform-endpoints.js";
import { SessionStateService } from "../SessionStateService";

export type ConnectCredentialRequest = BYOKCredentialConnectRequest;
export type UpdateCredentialRequest = BYOKCredentialUpdateRequest;
export type ValidateCredentialRequest = BYOKCredentialValidateRequest;
export type ValidationResult = BYOKCredentialValidateResponse;

export interface ProviderModelOption {
  id: string;
  name: string;
  provider?: string;
}

export type ProviderModelDiscoveryView = BYOKDiscoveredProviderModelsQuery["view"];

export interface ProviderModelsQuery {
  view?: ProviderModelDiscoveryView;
  limit?: number;
  cursor?: string;
}

export interface ProviderModelsPageInfo {
  limit: number;
  cursor?: string;
  nextCursor?: string;
  hasMore: boolean;
}

export interface ProviderModelsMetadata {
  fetchedAt: string;
  stale: boolean;
  source: BYOKModelDiscoverySource;
  staleReason?: string;
}

export interface ProviderModelsPageResult {
  providerId: string;
  view: ProviderModelDiscoveryView;
  models: ProviderModelOption[];
  page: ProviderModelsPageInfo;
  metadata: ProviderModelsMetadata;
}

export interface RunIdResolver {
  getRunId(): string | null;
}

export type ResolveChatRequest = BYOKResolveRequest;
export type ProviderCredential = BYOKCredential;
export type ProviderPreference = BYOKPreference;
export type ProviderResolution = BYOKResolution;

/**
 * HTTP error wrapper for provider API failures
 */
export class ProviderApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public correlationId?: string
  ) {
    super(message);
    this.name = "ProviderApiError";
  }

  isRetryable(): boolean {
    return this.statusCode >= 500 || this.statusCode === 429;
  }
}

export class ProviderApiClient {
  private static readonly sessionRunIdKey = "currentRunId";
  private readonly sdkClient;

  constructor(
    private readonly runIdResolver: RunIdResolver = new DefaultRunIdResolver(
      ProviderApiClient.sessionRunIdKey
    )
  ) {
    this.sdkClient = createProviderClient(
      createByokHttpTransport({
        baseUrl: `${getBrainHttpBase()}/api/byok`,
        getRunId: () => this.resolveRunId(),
      }),
    );
  }

  async getCatalog(): Promise<ProviderRegistryEntry[]> {
    return this.call(() => this.sdkClient.discoverProviders());
  }

  async getProviderModels(
    providerId: string,
    query: ProviderModelsQuery = {},
  ): Promise<ProviderModelsPageResult> {
    const response = await this.call(() =>
      this.sdkClient.discoverProviderModels(providerId, query),
    );
    return {
      providerId: response.providerId,
      view: response.view,
      models: response.models.map((model) => ({
        id: model.id,
        name: model.name,
        provider: model.providerId,
      })),
      page: response.page,
      metadata: response.metadata,
    };
  }

  async refreshProviderModels(
    providerId: string,
  ): Promise<BYOKDiscoveredProviderModelsRefreshResponse> {
    return this.call(() => this.sdkClient.refreshProviderModels(providerId));
  }

  async getCredentials(): Promise<ProviderCredential[]> {
    return this.call(() => this.sdkClient.listCredentials());
  }

  async connectCredential(
    req: ConnectCredentialRequest
  ): Promise<ProviderCredential> {
    return this.call(() => this.sdkClient.connectCredential(req));
  }

  async updateCredential(
    credentialId: string,
    req: UpdateCredentialRequest
  ): Promise<ProviderCredential> {
    return this.call(() => this.sdkClient.updateCredential(credentialId, req));
  }

  async disconnectCredential(credentialId: string): Promise<void> {
    await this.call(() => this.sdkClient.disconnectCredential(credentialId));
  }

  async validateCredential(
    credentialId: string,
    req: ValidateCredentialRequest
  ): Promise<ValidationResult> {
    return this.call(() => this.sdkClient.validateCredential(credentialId, req));
  }

  async getPreferences(): Promise<ProviderPreference> {
    return this.call(() => this.sdkClient.getPreferences());
  }

  async updatePreferences(
    req: BYOKPreferencesUpdateRequest
  ): Promise<ProviderPreference> {
    return this.call(() => this.sdkClient.selectDefault(req));
  }

  async resolveForChat(req: ResolveChatRequest): Promise<ProviderResolution> {
    return this.call(() => this.sdkClient.resolveForRun(req));
  }

  abort(key: string): void {
    void key;
    // SDK transport owns request orchestration; this remains as backward-compatible no-op.
  }

  private resolveRunId(): string | null {
    return this.runIdResolver.getRunId();
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapProviderApiError(error);
    }
  }
}

function mapProviderApiError(error: unknown): ProviderApiError {
  if (error instanceof ProviderApiError) {
    return error;
  }
  if (error instanceof ProviderClientContractError) {
    const statusCode = error.phase === "request" ? 400 : 502;
    const code =
      error.phase === "request"
        ? "INVALID_REQUEST_CONTRACT"
        : "INVALID_RESPONSE_CONTRACT";
    return new ProviderApiError(statusCode, code, error.message);
  }
  if (error instanceof ProviderClientOperationError) {
    const statusCode =
      error.statusCode ?? deriveStatusCodeFromOperationError(error.code, error.retryable);
    return new ProviderApiError(
      statusCode,
      error.code,
      error.message,
      error.correlationId,
    );
  }
  if (error instanceof Error) {
    return new ProviderApiError(500, "NETWORK_ERROR", error.message);
  }
  return new ProviderApiError(500, "NETWORK_ERROR", "Network request failed");
}

function deriveStatusCodeFromOperationError(
  code: string,
  retryable: boolean,
): number {
  if (code === "ABORTED") {
    return 0;
  }
  if (code === "MISSING_RUN_ID" || code === "INVALID_REQUEST_CONTRACT") {
    return 400;
  }
  if (
    code === "INVALID_RESPONSE_CONTRACT" ||
    code === "INVALID_RESPONSE_FORMAT" ||
    code === "INVALID_ERROR_RESPONSE"
  ) {
    return 502;
  }
  if (
    code === "RATE_LIMIT_EXCEEDED" ||
    code === "PROVIDER_RATE_LIMITED" ||
    code === "QUOTA_EXCEEDED"
  ) {
    return 429;
  }
  if (retryable || code === "NETWORK_ERROR") {
    return 500;
  }
  return 400;
}

class DefaultRunIdResolver implements RunIdResolver {
  constructor(private readonly runIdStorageKey: string) {}

  getRunId(): string | null {
    try {
      const runId = sessionStorage.getItem(this.runIdStorageKey);
      if (runId) {
        return runId;
      }
    } catch (error) {
      console.warn("[provider/resolveRunId] Failed to read sessionStorage", error);
    }
    return SessionStateService.loadActiveSessionRunId();
  }
}
