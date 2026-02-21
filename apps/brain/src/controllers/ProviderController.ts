/**
 * ProviderController
 * Single Responsibility: Route handlers for provider API endpoints
 * Validates requests and delegates to RunEngineRuntime provider routes
 * to guarantee a single provider-state owner path.
 */

import { z } from "zod";
import type { Env } from "../types/ai";
import {
  ConnectProviderRequestSchema,
  DisconnectProviderRequestSchema,
  ProviderIdSchema,
  type ProviderId,
} from "../schemas/provider";
import {
  errorResponse,
  withEngineHeaders,
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

const RunIdSchema = z.string().uuid();
const ScopeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const RUN_ID_MISSING_MESSAGE =
  "Missing required runId. Provide X-Run-Id header or runId query parameter.";

interface ProviderScopeContext {
  runId: string;
  userId?: string;
  workspaceId?: string;
}

/**
 * ProviderController - Route handlers for provider API
 * Each method handles one specific endpoint responsibility
 * Provider state is delegated to RunEngineRuntime per runId
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
      const scope = resolveProviderScope(req, correlationId);

      return proxyProviderOperation(req, env, {
        scope,
        method: "POST",
        path: "/providers/connect",
        body: validatedRequest,
      });
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
      const scope = resolveProviderScope(req, correlationId);

      return proxyProviderOperation(req, env, {
        scope,
        method: "POST",
        path: "/providers/disconnect",
        body: validatedRequest,
      });
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
      const scope = resolveProviderScope(req, correlationId);
      return proxyProviderOperation(req, env, {
        scope,
        method: "GET",
        path: "/providers/status",
      });
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
      const scope = resolveProviderScope(req, correlationId);
      return proxyProviderOperation(req, env, {
        scope,
        method: "GET",
        path: `/providers/models?providerId=${encodeURIComponent(providerId)}`,
      });
    } catch (error) {
      return handleProviderError(req, env, error, "models", correlationId);
    }
  }
}

function resolveProviderScope(
  req: Request,
  correlationId: string,
): ProviderScopeContext {
  const url = new URL(req.url);
  const candidate =
    req.headers.get("X-Run-Id") ?? url.searchParams.get("runId");

  if (!candidate) {
    throw new ValidationError(
      RUN_ID_MISSING_MESSAGE,
      "MISSING_RUN_ID",
      correlationId,
    );
  }

  const runId = validateWithSchema<string>(candidate, RunIdSchema, correlationId);

  return {
    runId,
    userId: resolveOptionalScopeId(
      req.headers.get("X-User-Id") ?? url.searchParams.get("userId"),
      correlationId,
    ),
    workspaceId: resolveOptionalScopeId(
      req.headers.get("X-Workspace-Id") ?? url.searchParams.get("workspaceId"),
      correlationId,
    ),
  };
}

async function proxyProviderOperation(
  req: Request,
  env: Env,
  operation: {
    scope: ProviderScopeContext;
    method: "GET" | "POST";
    path: string;
    body?: unknown;
  },
): Promise<Response> {
  const id = env.RUN_ENGINE_RUNTIME.idFromName(operation.scope.runId);
  const stub = env.RUN_ENGINE_RUNTIME.get(id);
  const headers = new Headers({ "X-Run-Id": operation.scope.runId });
  if (operation.scope.userId) {
    headers.set("X-User-Id", operation.scope.userId);
  }
  if (operation.scope.workspaceId) {
    headers.set("X-Workspace-Id", operation.scope.workspaceId);
  }

  let body: string | undefined;
  if (operation.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(operation.body);
  }

  const response = await stub.fetch(`https://run-engine${operation.path}`, {
    method: operation.method,
    headers,
    body,
  });

  return withEngineHeaders(
    req,
    env,
    response as unknown as Response,
    operation.scope.runId,
  );
}

function resolveOptionalScopeId(
  candidate: string | null,
  correlationId: string,
): string | undefined {
  if (!candidate || candidate.trim().length === 0) {
    return undefined;
  }
  return validateWithSchema(candidate.trim(), ScopeIdSchema, correlationId);
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
