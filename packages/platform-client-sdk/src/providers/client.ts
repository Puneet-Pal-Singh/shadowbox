import { z } from "zod";
import {
  ProviderClientContractError,
  normalizeProviderClientOperationError,
} from "./errors.js";
import {
  BYOKCredentialConnectRequestSchema,
  BYOKCredentialSchema,
  BYOKCredentialUpdateRequestSchema,
  BYOKCredentialValidateRequestSchema,
  BYOKCredentialValidateResponseSchema,
  BYOKDiscoveredProviderModelsQuerySchema,
  BYOKDiscoveredProviderModelsRefreshResponseSchema,
  BYOKDiscoveredProviderModelsResponseSchema,
  BYOKPreferenceSchema,
  BYOKPreferencesUpdateRequestSchema,
  BYOKResolutionSchema,
  BYOKResolveRequestSchema,
  ProviderRegistryEntrySchema,
  type BYOKCredential,
  type BYOKCredentialConnectRequest,
  type BYOKCredentialUpdateRequest,
  type BYOKCredentialValidateRequest,
  type BYOKCredentialValidateResponse,
  type BYOKDiscoveredProviderModelsRefreshResponse,
  type BYOKDiscoveredProviderModelsResponse,
  type BYOKPreference,
  type BYOKPreferencesUpdateRequest,
  type BYOKResolution,
  type BYOKResolveRequest,
  type ProviderModelsQuery,
  type ProviderRegistryEntry,
} from "./types.js";

const ProviderCatalogSchema = ProviderRegistryEntrySchema.array();
const CredentialListSchema = BYOKCredentialSchema.array();

export interface ProviderClientTransport {
  discoverProviders(): Promise<unknown>;
  discoverProviderModels(providerId: string, query: unknown): Promise<unknown>;
  refreshProviderModels(providerId: string): Promise<unknown>;
  listCredentials(): Promise<unknown>;
  connectCredential(request: BYOKCredentialConnectRequest): Promise<unknown>;
  updateCredential(
    credentialId: string,
    request: BYOKCredentialUpdateRequest,
  ): Promise<unknown>;
  disconnectCredential(credentialId: string): Promise<void>;
  validateCredential(
    credentialId: string,
    request: BYOKCredentialValidateRequest,
  ): Promise<unknown>;
  getPreferences(): Promise<unknown>;
  updatePreferences(request: BYOKPreferencesUpdateRequest): Promise<unknown>;
  resolveForRun(request: BYOKResolveRequest): Promise<unknown>;
}

export class ProviderClient {
  constructor(private readonly transport: ProviderClientTransport) {}

  async discoverProviders(): Promise<ProviderRegistryEntry[]> {
    const payload = await this.invokeTransportOperation(
      "discoverProviders",
      () => this.transport.discoverProviders(),
    );
    return parseResponse(payload, ProviderCatalogSchema, "discoverProviders");
  }

  async discoverProviderModels(
    providerId: string,
    query: ProviderModelsQuery = {},
  ): Promise<BYOKDiscoveredProviderModelsResponse> {
    const normalizedProviderId = requireIdentifier(
      providerId,
      "providerId",
      "discoverProviderModels",
    );
    const normalizedQuery = parseRequest(
      query,
      BYOKDiscoveredProviderModelsQuerySchema,
      "discoverProviderModels",
    );
    const payload = await this.invokeTransportOperation(
      "discoverProviderModels",
      () =>
        this.transport.discoverProviderModels(
          normalizedProviderId,
          normalizedQuery,
        ),
    );
    return parseResponse(
      payload,
      BYOKDiscoveredProviderModelsResponseSchema,
      "discoverProviderModels",
    );
  }

  async refreshProviderModels(
    providerId: string,
  ): Promise<BYOKDiscoveredProviderModelsRefreshResponse> {
    const normalizedProviderId = requireIdentifier(
      providerId,
      "providerId",
      "refreshProviderModels",
    );
    const payload = await this.invokeTransportOperation(
      "refreshProviderModels",
      () => this.transport.refreshProviderModels(normalizedProviderId),
    );
    return parseResponse(
      payload,
      BYOKDiscoveredProviderModelsRefreshResponseSchema,
      "refreshProviderModels",
    );
  }

  async listCredentials(): Promise<BYOKCredential[]> {
    const payload = await this.invokeTransportOperation("listCredentials", () =>
      this.transport.listCredentials(),
    );
    return parseResponse(payload, CredentialListSchema, "listCredentials");
  }

  async connectCredential(
    request: BYOKCredentialConnectRequest,
  ): Promise<BYOKCredential> {
    const normalizedRequest = parseRequest(
      request,
      BYOKCredentialConnectRequestSchema,
      "connectCredential",
    );
    const payload = await this.invokeTransportOperation("connectCredential", () =>
      this.transport.connectCredential(normalizedRequest),
    );
    return parseResponse(payload, BYOKCredentialSchema, "connectCredential");
  }

  async updateCredential(
    credentialId: string,
    request: BYOKCredentialUpdateRequest,
  ): Promise<BYOKCredential> {
    const normalizedCredentialId = requireIdentifier(
      credentialId,
      "credentialId",
      "updateCredential",
    );
    const normalizedRequest = parseRequest(
      request,
      BYOKCredentialUpdateRequestSchema,
      "updateCredential",
    );
    const payload = await this.invokeTransportOperation("updateCredential", () =>
      this.transport.updateCredential(normalizedCredentialId, normalizedRequest),
    );
    return parseResponse(payload, BYOKCredentialSchema, "updateCredential");
  }

  async disconnectCredential(credentialId: string): Promise<void> {
    const normalizedCredentialId = requireIdentifier(
      credentialId,
      "credentialId",
      "disconnectCredential",
    );
    await this.invokeTransportOperation("disconnectCredential", () =>
      this.transport.disconnectCredential(normalizedCredentialId),
    );
  }

  async validateCredential(
    credentialId: string,
    request: BYOKCredentialValidateRequest,
  ): Promise<BYOKCredentialValidateResponse> {
    const normalizedCredentialId = requireIdentifier(
      credentialId,
      "credentialId",
      "validateCredential",
    );
    const normalizedRequest = parseRequest(
      request,
      BYOKCredentialValidateRequestSchema,
      "validateCredential",
    );
    const payload = await this.invokeTransportOperation("validateCredential", () =>
      this.transport.validateCredential(normalizedCredentialId, normalizedRequest),
    );
    return parseResponse(
      payload,
      BYOKCredentialValidateResponseSchema,
      "validateCredential",
    );
  }

  async getPreferences(): Promise<BYOKPreference> {
    const payload = await this.invokeTransportOperation("getPreferences", () =>
      this.transport.getPreferences(),
    );
    return parseResponse(payload, BYOKPreferenceSchema, "getPreferences");
  }

  async selectDefault(
    request: BYOKPreferencesUpdateRequest,
  ): Promise<BYOKPreference> {
    const normalizedRequest = parseRequest(
      request,
      BYOKPreferencesUpdateRequestSchema,
      "selectDefault",
    );
    const payload = await this.invokeTransportOperation("selectDefault", () =>
      this.transport.updatePreferences(normalizedRequest),
    );
    return parseResponse(payload, BYOKPreferenceSchema, "selectDefault");
  }

  async resolveForRun(request: BYOKResolveRequest): Promise<BYOKResolution> {
    const normalizedRequest = parseRequest(
      request,
      BYOKResolveRequestSchema,
      "resolveForRun",
    );
    const payload = await this.invokeTransportOperation("resolveForRun", () =>
      this.transport.resolveForRun(normalizedRequest),
    );
    return parseResponse(payload, BYOKResolutionSchema, "resolveForRun");
  }

  private async invokeTransportOperation<T>(
    operation: string,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw normalizeProviderClientOperationError(error, operation);
    }
  }
}

export function createProviderClient(
  transport: ProviderClientTransport,
): ProviderClient {
  return new ProviderClient(transport);
}

function parseRequest<TSchema extends z.ZodTypeAny>(
  payload: unknown,
  schema: TSchema,
  operation: string,
): z.output<TSchema> {
  return parseContract(payload, schema, "request", operation);
}

function parseResponse<TSchema extends z.ZodTypeAny>(
  payload: unknown,
  schema: TSchema,
  operation: string,
): z.output<TSchema> {
  return parseContract(payload, schema, "response", operation);
}

function parseContract<TSchema extends z.ZodTypeAny>(
  payload: unknown,
  schema: TSchema,
  phase: "request" | "response",
  operation: string,
): z.output<TSchema> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ProviderClientContractError(
      phase,
      operation,
      `Invalid ${phase} contract for ${operation}`,
    );
  }
  return parsed.data;
}

function requireIdentifier(
  value: string,
  fieldName: string,
  operation: string,
): string {
  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    throw new ProviderClientContractError(
      "request",
      operation,
      `Missing required identifier: ${fieldName}`,
    );
  }
  return normalizedValue;
}
