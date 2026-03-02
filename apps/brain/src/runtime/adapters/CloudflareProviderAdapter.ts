/**
 * CloudflareProviderAdapter - Cloudflare implementation of ProviderResolutionPort.
 *
 * Bridges provider configuration, authentication, and LLM gateway to port contracts.
 * This adapter owns credential resolution and model inference routing.
 */

import type { ModelMetadata } from "@repo/shared-types";
import type { Env } from "../../types/ai";
import { AIService } from "../../services/AIService";
import { ProviderConfigService } from "../../services/providers";
import type { ProviderResolutionPort } from "../ports";

/**
 * Cloudflare-backed implementation of provider resolution.
 *
 * Owns:
 * - Credential resolution and validation
 * - Model metadata and availability
 * - LLM inference gateway wiring
 */
export class CloudflareProviderAdapter implements ProviderResolutionPort {
  private readonly env: Env;
  private readonly aiService: AIService;
  private readonly providerConfigService: ProviderConfigService;

  constructor(
    env: Env,
    aiService: AIService,
    providerConfigService: ProviderConfigService,
  ) {
    this.env = env;
    this.aiService = aiService;
    this.providerConfigService = providerConfigService;
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
    const connections = await this.providerConfigService.getConnections();
    const connection = connections.find((c) => c.providerId === providerId);

    if (!connection) {
      return {
        providerId,
        configured: false,
      };
    }

    return {
      providerId,
      configured: true,
      lastValidated: connection.lastValidated,
      expiresAt: connection.expiresAt,
    };
  }

  async resolveCredential(_runId: string, providerId: string): Promise<unknown> {
    // Provider credentials are resolved through AIService and provider config.
    // Return opaque credential object (specific to provider adapter).
    const provider = await this.aiService.getProvider();
    if (provider.id !== providerId) {
      throw new Error(
        `Provider mismatch: expected ${providerId}, got ${provider.id}`,
      );
    }

    // Credential is owned by provider adapter; Brain doesn't inspect it.
    return provider;
  }

  async getModels(providerId: string): Promise<ModelMetadata[]> {
    // Delegate to provider config service which owns model catalog.
    const response = await this.providerConfigService.getModels(providerId);
    return response.models || [];
  }

  async generateText(
    providerId: string,
    _modelId: string,
    input: unknown,
  ): Promise<string> {
    // Ensure provider matches, then delegate to AIService.
    const provider = await this.aiService.getProvider();
    if (provider.id !== providerId) {
      throw new Error(
        `Provider mismatch: expected ${providerId}, got ${provider.id}`,
      );
    }

    const result = await this.aiService.generateText(input as unknown);
    return result.text || "";
  }

  async generateStructured(
    providerId: string,
    _modelId: string,
    input: unknown,
  ): Promise<unknown> {
    const provider = await this.aiService.getProvider();
    if (provider.id !== providerId) {
      throw new Error(
        `Provider mismatch: expected ${providerId}, got ${provider.id}`,
      );
    }

    return this.aiService.generateStructured(input as unknown);
  }

  async createChatStream(
    providerId: string,
    _modelId: string,
    input: unknown,
  ): Promise<ReadableStream<unknown>> {
    const provider = await this.aiService.getProvider();
    if (provider.id !== providerId) {
      throw new Error(
        `Provider mismatch: expected ${providerId}, got ${provider.id}`,
      );
    }

    return this.aiService.createChatStream(input as unknown);
  }
}
