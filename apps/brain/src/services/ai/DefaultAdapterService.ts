// apps/brain/src/services/ai/DefaultAdapterService.ts
// SRP: Responsible ONLY for creating the default provider adapter

import type { Env } from "../../types/ai";
import type {
  ProviderAdapter,
  GenerationParams,
  GenerationResult,
  StreamChunk,
} from "../providers";
import { createDefaultAdapter } from "./ProviderAdapterFactory";
import { ValidationError } from "../../domain/errors";

/**
 * DefaultAdapterService - SRP: Create and manage default adapter with error handling
 * Handles fallback when no provider is configured
 */
export class DefaultAdapterService {
  static createResillient(env: Env): ProviderAdapter {
    try {
      return createDefaultAdapter(env);
    } catch (error) {
      console.warn(
        "[ai/adapter] default adapter unavailable; using error adapter",
        error,
      );
      return new MissingProviderConfigAdapter(env);
    }
  }
}

/**
 * MissingProviderConfigAdapter - Fallback adapter when no provider is configured
 * All operations throw with clear error message
 */
class MissingProviderConfigAdapter implements ProviderAdapter {
  readonly provider: string;
  readonly supportedModels: string[] = [];
  private readonly configurationError: ValidationError;

  constructor(env: Env) {
    this.provider = env.LLM_PROVIDER ?? "litellm";
    this.configurationError = new ValidationError(
      "No default provider key is configured. Connect a BYOK provider in Settings or configure explicit runtime provider credentials.",
      "INFERENCE_PROVIDER_NOT_CONFIGURED",
    );
  }

  supportsModel(_model: string): boolean {
    return false;
  }

  async generate(_params: GenerationParams): Promise<GenerationResult> {
    throw this.configurationError;
  }

  async *generateStream(
    _params: GenerationParams,
  ): AsyncGenerator<StreamChunk, GenerationResult, unknown> {
    throw this.configurationError;
  }
}
