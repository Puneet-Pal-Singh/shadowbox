/**
 * Provider Type Definitions
 * UI-facing provider types.
 *
 * Transport contracts are canonical in @repo/shared-types and re-exported here
 * for backward-compatible imports across web components/services.
 */

import type {
  BYOKConnectRequest,
  BYOKConnectResponse,
  BYOKDisconnectRequest,
  BYOKDisconnectResponse,
  BYOKPreferences as SharedBYOKPreferences,
  BYOKPreferencesPatch as SharedBYOKPreferencesPatch,
  ModelDescriptor as SharedModelDescriptor,
  ProviderConnection,
  ProviderId as SharedProviderId,
} from "@repo/shared-types";

export type ProviderId = SharedProviderId;
export type ModelDescriptor = SharedModelDescriptor;
export type ProviderConnectionStatus = ProviderConnection;
export type ConnectProviderRequest = BYOKConnectRequest;
export type ConnectProviderResponse = BYOKConnectResponse;
export type DisconnectProviderRequest = BYOKDisconnectRequest;
export type DisconnectProviderResponse = BYOKDisconnectResponse;
export type BYOKPreferences = SharedBYOKPreferences;
export type BYOKPreferencesPatch = SharedBYOKPreferencesPatch;

export interface ProviderConfig {
  providerId: ProviderId;
  status: "disconnected" | "connecting" | "connected" | "failed";
  lastValidatedAt?: string;
  defaultModel?: string;
  errorMessage?: string;
}

export interface SessionModelConfig {
  sessionId: string;
  providerId: ProviderId;
  modelId: string;
}

export interface ModelsListResponse {
  providerId: ProviderId;
  models: ModelDescriptor[];
  lastFetchedAt: string;
}
