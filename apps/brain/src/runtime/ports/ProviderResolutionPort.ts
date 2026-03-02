/**
 * ProviderResolutionPort - Boundary for provider authentication and model resolution.
 *
 * This port abstracts provider credential resolution and model selection logic.
 * It separates concerns: auth/credential handling from model inference selection.
 *
 * Canonical alignment: ProviderAuthPort + ModelProviderPort (Charter 46)
 */

export interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  costPer1kPromptTokens?: number;
  costPer1kCompletionTokens?: number;
  capabilities?: {
    streaming?: boolean;
    tools?: boolean;
    structuredOutputs?: boolean;
    jsonMode?: boolean;
  };
}

/**
 * Port for provider authentication and credential resolution.
 * Handles credential validation, storage, and lifecycle.
 */
export interface ProviderAuthPort {
  /**
   * Get credential status for a provider in a given scope.
   *
   * @param runId - Unique run identifier
   * @param providerId - Provider identifier (e.g., "openai", "anthropic")
   * @returns Credential status or null if not configured
   */
  getCredentialStatus(
    runId: string,
    providerId: string,
  ): Promise<{
    providerId: string;
    configured: boolean;
    lastValidated?: number;
    expiresAt?: number;
  } | null>;

  /**
   * Resolve a credential for inference.
   *
   * @param runId - Unique run identifier
   * @param providerId - Provider identifier
   * @returns Resolved credential (opaque to runtime, specific to provider adapter)
   * @throws Error if credential cannot be resolved
   */
  resolveCredential(runId: string, providerId: string): Promise<unknown>;
}

/**
 * Port for model provider inference and capability resolution.
 * Handles model selection, streaming, and provider-native operations.
 */
export interface ModelProviderPort {
  /**
   * Get available models for a provider.
   *
   * @param providerId - Provider identifier
   * @returns Array of available model metadata
   */
  getModels(providerId: string): Promise<ModelMetadata[]>;

  /**
   * Generate text using a provider's model.
   *
   * @param providerId - Provider identifier
   * @param modelId - Model identifier
   * @param input - Generation input (messages, parameters, etc.)
   * @returns Generated text
   */
  generateText(
    providerId: string,
    modelId: string,
    input: unknown,
  ): Promise<string>;

  /**
   * Generate structured output using a provider's model.
   *
   * @param providerId - Provider identifier
   * @param modelId - Model identifier
   * @param input - Generation input with schema
   * @returns Parsed structured output
   */
  generateStructured(
    providerId: string,
    modelId: string,
    input: unknown,
  ): Promise<unknown>;

  /**
   * Create a streaming chat response.
   *
   * @param providerId - Provider identifier
   * @param modelId - Model identifier
   * @param input - Chat input
   * @returns ReadableStream of events
   */
  createChatStream(
    providerId: string,
    modelId: string,
    input: unknown,
  ): Promise<ReadableStream<unknown>>;
}

/**
 * Composite port for complete provider resolution.
 * Combines authentication and model inference concerns.
 */
export interface ProviderResolutionPort
  extends ProviderAuthPort,
    ModelProviderPort {}
