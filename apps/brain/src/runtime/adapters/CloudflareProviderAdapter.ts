/**
 * CloudflareProviderAdapter - Cloudflare implementation of ProviderResolutionPort.
 *
 * Bridges provider configuration, authentication, and LLM gateway to port contracts.
 * This adapter owns credential resolution and model inference routing.
 */

import type { ModelMetadata, ProviderResolutionPort } from "../ports";

/**
 * Cloudflare-backed implementation of provider resolution.
 *
 * Owns:
 * - Credential resolution and validation
 * - Model metadata and availability
 * - LLM inference gateway wiring
 */
export class CloudflareProviderAdapter implements ProviderResolutionPort {
  constructor() {
    // Stub implementation
  }

  async getCredentialStatus(
    _runId: string,
    providerId: string,
  ): Promise<{
    providerId: string;
    configured: boolean;
    lastValidated?: number;
    expiresAt?: number;
  } | null> {
    // Stub: Credential resolution is handled at Muscle boundary
    throw new Error(
      "ProviderResolutionPort.getCredentialStatus should be invoked at Muscle boundary, not Brain.",
    );
  }

  async resolveCredential(_runId: string, _providerId: string): Promise<unknown> {
    // Stub: Credential resolution is handled at Muscle boundary
    throw new Error(
      "ProviderResolutionPort.resolveCredential should be invoked at Muscle boundary, not Brain.",
    );
  }

  async getModels(_providerId: string): Promise<ModelMetadata[]> {
    // Stub: Model retrieval is handled at Muscle boundary
    throw new Error(
      "ProviderResolutionPort.getModels should be invoked at Muscle boundary, not Brain.",
    );
  }

  async generateText(
    _providerId: string,
    _modelId: string,
    _input: unknown,
  ): Promise<string> {
    // Stub: Text generation is handled at Muscle boundary
    throw new Error(
      "ProviderResolutionPort.generateText should be invoked at Muscle boundary, not Brain.",
    );
  }

  async generateStructured(
    _providerId: string,
    _modelId: string,
    _input: unknown,
  ): Promise<unknown> {
    // Stub: Structured generation is handled at Muscle boundary
    throw new Error(
      "ProviderResolutionPort.generateStructured should be invoked at Muscle boundary, not Brain.",
    );
  }

  async createChatStream(
    _providerId: string,
    _modelId: string,
    _input: unknown,
  ): Promise<ReadableStream<unknown>> {
    // Stub: Chat streaming is handled at Muscle boundary
    throw new Error(
      "ProviderResolutionPort.createChatStream should be invoked at Muscle boundary, not Brain.",
    );
  }
}
