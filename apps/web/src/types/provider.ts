/**
 * Provider Type Definitions
 * Types for provider configuration and management
 */

export type ProviderId = "openrouter" | "openai";

export interface ModelDescriptor {
  id: string;
  name: string;
  provider: ProviderId;
  costPer1kTokens?: {
    input: number;
    output: number;
  };
  contextWindow?: number;
  description?: string;
}

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

export interface ProviderConnectionStatus {
  providerId: ProviderId;
  status: "disconnected" | "connected" | "failed";
  lastValidatedAt?: string;
  errorMessage?: string;
}

export interface ConnectProviderRequest {
  providerId: ProviderId;
  apiKey: string;
}

export interface ConnectProviderResponse {
  status: "connected" | "failed";
  providerId: ProviderId;
  errorMessage?: string;
}

export interface DisconnectProviderRequest {
  providerId: ProviderId;
}

export interface DisconnectProviderResponse {
  status: "disconnected";
  providerId: ProviderId;
}

export interface ModelsListResponse {
  providerId: ProviderId;
  models: ModelDescriptor[];
  lastFetchedAt: string;
}
