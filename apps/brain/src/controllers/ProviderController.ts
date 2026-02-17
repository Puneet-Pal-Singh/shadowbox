/**
 * ProviderController
 * Single Responsibility: Route handlers for provider API endpoints
 * Validates requests and delegates to ProviderConfigService
 */

import { getCorsHeaders } from "../lib/cors";
import type { Env } from "../types/ai";
import { ProviderConfigService } from "../services/ProviderConfigService";
import {
  ConnectProviderRequestSchema,
  DisconnectProviderRequestSchema,
  ProviderIdSchema,
  type ProviderId,
} from "../schemas/provider";

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
    console.log(`[Provider:${correlationId}] Connect request received`);

    try {
      const body = await parseRequestBody(req);

      const validatedRequest = ConnectProviderRequestSchema.parse(body);
      const service = getProviderConfigService(env);
      const response = await service.connect(validatedRequest);

      return successResponse(req, env, response);
    } catch (error) {
      return handleError(req, env, error, "connect", correlationId);
    }
  }

  /**
   * POST /api/providers/disconnect
   * Disconnect a provider
   */
  static async disconnect(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[Provider:${correlationId}] Disconnect request received`);

    try {
      const body = await parseRequestBody(req);

      const validatedRequest =
        DisconnectProviderRequestSchema.parse(body);
      const service = getProviderConfigService(env);
      const response = await service.disconnect(validatedRequest);

      return successResponse(req, env, response);
    } catch (error) {
      return handleError(req, env, error, "disconnect", correlationId);
    }
  }

  /**
   * GET /api/providers/status
   * Get connection status for all providers
   */
  static async status(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[Provider:${correlationId}] Status request received`);

    try {
      const service = getProviderConfigService(env);
      const providers = await service.getStatus();

      const response = {
        providers,
      };

      return successResponse(req, env, response);
    } catch (error) {
      return handleError(req, env, error, "status", correlationId);
    }
  }

  /**
   * GET /api/providers/models?providerId=...
   * Get available models for a provider
   */
  static async models(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[Provider:${correlationId}] Models request received`);

    try {
      const url = new URL(req.url);
      const providerIdParam = url.searchParams.get("providerId");

      if (!providerIdParam) {
        return errorResponse(
          req,
          env,
          "Missing required query parameter: providerId",
          400,
        );
      }

      const providerId = ProviderIdSchema.parse(providerIdParam);
      const service = getProviderConfigService(env);
      const response = await service.getModels(providerId);

      return successResponse(req, env, response);
    } catch (error) {
      return handleError(req, env, error, "models", correlationId);
    }
  }
}

async function parseRequestBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch (error) {
    // Propagate parse errors so handleError can detect and handle them
    throw error;
  }
}

function successResponse(
  req: Request,
  env: Env,
  data: unknown,
): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      ...getCorsHeaders(req, env),
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  req: Request,
  env: Env,
  message: string,
  status: number,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...getCorsHeaders(req, env),
      "Content-Type": "application/json",
    },
  });
}

function handleError(
  req: Request,
  env: Env,
  error: unknown,
  operation: string,
  correlationId: string,
): Response {
  if (error instanceof SyntaxError) {
    console.warn(
      `[Provider:${correlationId}] Invalid JSON in ${operation} request`,
    );
    return errorResponse(
      req,
      env,
      "Invalid request body (malformed JSON)",
      400,
    );
  }

  if (error instanceof Error) {
    if (error.name === "ZodError") {
      console.warn(
        `[Provider:${correlationId}] Validation error in ${operation}:`,
        error.message,
      );
      return errorResponse(req, env, `Validation error: ${error.message}`, 400);
    }

    console.error(
      `[Provider:${correlationId}] Error in ${operation}:`,
      error,
    );
    return errorResponse(req, env, error.message, 500);
  }

  console.error(`[Provider:${correlationId}] Unknown error in ${operation}:`, error);
  return errorResponse(req, env, "Internal Server Error", 500);
}
