/**
 * ProviderController
 * Single Responsibility: Route handlers for provider API endpoints
 * Validates requests and delegates to ProviderConfigService
 */

import type { Env } from "../types/ai";
import { ProviderConfigService } from "../services/ProviderConfigService";
import {
  ConnectProviderRequestSchema,
  DisconnectProviderRequestSchema,
  ProviderIdSchema,
  type ProviderId,
} from "../schemas/provider";
import {
  errorResponse,
  jsonResponse,
} from "../http/response";
import {
  parseRequestBody,
  validateWithSchema,
} from "../http/validation";
import {
  ValidationError,
  isDomainError,
  mapDomainErrorToHttp,
} from "../domain/errors";

/**
 * Singleton instance of ProviderConfigService
 * Persists in-memory state across requests within an isolate lifecycle
 */
let providerConfigServiceInstance: ProviderConfigService | null = null;

function getProviderConfigService(env: Env): ProviderConfigService {
  if (!providerConfigServiceInstance) {
    providerConfigServiceInstance = new ProviderConfigService(env);
  }
  return providerConfigServiceInstance;
}

/**
 * ProviderController - Route handlers for provider API
 * Each method handles one specific endpoint responsibility
 */
export class ProviderController {
  /**
   * POST /api/providers/connect
   * Connect a provider with API key
   */
  static async connect(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[provider/connect] ${correlationId} request received`);

    try {
      const body = await parseRequestBody(req, correlationId);
      const validatedRequest = validateWithSchema<{
        providerId: ProviderId;
        apiKey: string;
      }>(body, ConnectProviderRequestSchema, correlationId);

      const service = getProviderConfigService(env);
      const response = await service.connect(validatedRequest);

      return jsonResponse(req, env, response);
    } catch (error) {
      return handleProviderError(req, env, error, "connect", correlationId);
    }
  }

  /**
   * POST /api/providers/disconnect
   * Disconnect a provider
   */
  static async disconnect(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[provider/disconnect] ${correlationId} request received`);

    try {
      const body = await parseRequestBody(req, correlationId);
      const validatedRequest = validateWithSchema<{
        providerId: ProviderId;
      }>(body, DisconnectProviderRequestSchema, correlationId);

      const service = getProviderConfigService(env);
      const response = await service.disconnect(validatedRequest);

      return jsonResponse(req, env, response);
    } catch (error) {
      return handleProviderError(req, env, error, "disconnect", correlationId);
    }
  }

  /**
   * GET /api/providers/status
   * Get connection status for all providers
   */
  static async status(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[provider/status] ${correlationId} request received`);

    try {
      const service = getProviderConfigService(env);
      const providers = await service.getStatus();

      return jsonResponse(req, env, { providers });
    } catch (error) {
      return handleProviderError(req, env, error, "status", correlationId);
    }
  }

  /**
   * GET /api/providers/models?providerId=...
   * Get available models for a provider
   */
  static async models(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[provider/models] ${correlationId} request received`);

    try {
      const url = new URL(req.url);
      const providerIdParam = url.searchParams.get("providerId");

      if (!providerIdParam) {
        throw new ValidationError(
          "Missing required query parameter: providerId",
          "MISSING_PROVIDER_ID",
          correlationId,
        );
      }

      const providerId = validateWithSchema<ProviderId>(
        providerIdParam,
        ProviderIdSchema,
        correlationId,
      );

      const service = getProviderConfigService(env);
      const response = await service.getModels(providerId);

      return jsonResponse(req, env, response);
    } catch (error) {
      return handleProviderError(req, env, error, "models", correlationId);
    }
  }
}

function handleProviderError(
  req: Request,
  env: Env,
  error: unknown,
  operation: string,
  correlationId: string,
): Response {
  if (isDomainError(error)) {
    console.warn(
      `[provider/${operation}] ${correlationId}: ${error.code} - ${error.message}`,
    );
    const { status, code, message } = mapDomainErrorToHttp(error);
    return errorResponse(req, env, message, status, code);
  }

  if (error instanceof Error) {
    console.error(
      `[provider/${operation}] ${correlationId}: ${error.message}`,
      error,
    );
    return errorResponse(
      req,
      env,
      "Internal server error",
      500,
    );
  }

  console.error(`[provider/${operation}] ${correlationId}: unknown error`, error);
  return errorResponse(req, env, "Internal server error", 500);
}
