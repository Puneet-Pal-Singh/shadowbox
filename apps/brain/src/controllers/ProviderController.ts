/**
 * ProviderController
 * Single Responsibility: Route handlers for provider API endpoints
 * Validates requests and delegates to RunEngineRuntime provider routes
 * to guarantee a single provider-state owner path.
 */

import { z } from "zod";
import {
  BYOKConnectRequestSchema,
  BYOKConnectResponseSchema,
  BYOKDisconnectRequestSchema,
  BYOKDisconnectResponseSchema,
  BYOKPreferencesPatchSchema,
  BYOKPreferencesSchema,
  BYOKValidateRequestSchema,
  BYOKValidateResponseSchema,
  ProviderCatalogResponseSchema,
  ProviderConnectionsResponseSchema,
} from "@repo/shared-types";
import type { Env } from "../types/ai";
import {
  jsonResponse,
  withEngineHeaders,
} from "../http/response";
import {
  parseRequestBody,
  validateWithSchema,
} from "../http/validation";
import {
  ValidationError,
  isDomainError,
  normalizeProviderErrorCode,
  toNormalizedProviderError,
} from "../domain/errors";
import {
  resolveAuthorizedProviderScope,
  type AuthorizedProviderScope,
} from "../services/providers/ProviderAuthScopeService";

/**
 * ProviderController - Route handlers for provider API
 * Each method handles one specific endpoint responsibility
 * Provider state is delegated to RunEngineRuntime per runId
 */
export class ProviderController {
  static async byokCatalog(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[provider/byok-catalog] ${correlationId} request received`);
    try {
      const scope = await resolveAuthorizedProviderScope(req, env, correlationId);
      return await proxyByokOperation(
        req,
        env,
        {
          scope,
          method: "GET",
          path: "/providers/catalog",
        },
        ProviderCatalogResponseSchema,
        correlationId,
      );
    } catch (error) {
      return handleByokError(req, env, error, correlationId);
    }
  }

  static async byokConnections(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[provider/byok-connections] ${correlationId} request received`);
    try {
      const scope = await resolveAuthorizedProviderScope(req, env, correlationId);
      return await proxyByokOperation(
        req,
        env,
        {
          scope,
          method: "GET",
          path: "/providers/connections",
        },
        ProviderConnectionsResponseSchema,
        correlationId,
      );
    } catch (error) {
      return handleByokError(req, env, error, correlationId);
    }
  }

  static async byokConnect(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[provider/byok-connect] ${correlationId} request received`);
    try {
      const scope = await resolveAuthorizedProviderScope(req, env, correlationId);
      const body = await parseRequestBody(req, correlationId);
      const validatedRequest = validateWithSchema(
        body,
        BYOKConnectRequestSchema,
        correlationId,
      );
      return await proxyByokOperation(
        req,
        env,
        {
          scope,
          method: "POST",
          path: "/providers/connect",
          body: validatedRequest,
        },
        BYOKConnectResponseSchema,
        correlationId,
      );
    } catch (error) {
      return handleByokError(req, env, error, correlationId);
    }
  }

  static async byokValidate(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[provider/byok-validate] ${correlationId} request received`);
    try {
      const scope = await resolveAuthorizedProviderScope(req, env, correlationId);
      const body = await parseRequestBody(req, correlationId);
      const validatedRequest = validateWithSchema(
        body,
        BYOKValidateRequestSchema,
        correlationId,
      );
      return await proxyByokOperation(
        req,
        env,
        {
          scope,
          method: "POST",
          path: "/providers/validate",
          body: validatedRequest,
        },
        BYOKValidateResponseSchema,
        correlationId,
      );
    } catch (error) {
      return handleByokError(req, env, error, correlationId);
    }
  }

  static async byokDisconnect(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[provider/byok-disconnect] ${correlationId} request received`);
    try {
      const scope = await resolveAuthorizedProviderScope(req, env, correlationId);
      const body = await parseRequestBody(req, correlationId);
      const validatedRequest = validateWithSchema(
        body,
        BYOKDisconnectRequestSchema,
        correlationId,
      );
      return await proxyByokOperation(
        req,
        env,
        {
          scope,
          method: "POST",
          path: "/providers/disconnect",
          body: validatedRequest,
        },
        BYOKDisconnectResponseSchema,
        correlationId,
      );
    } catch (error) {
      return handleByokError(req, env, error, correlationId);
    }
  }

  static async byokPreferences(req: Request, env: Env): Promise<Response> {
    const correlationId = Math.random().toString(36).substring(7);
    console.log(`[provider/byok-preferences] ${correlationId} request received`);
    try {
      const scope = await resolveAuthorizedProviderScope(req, env, correlationId);
      const body = await parseRequestBody(req, correlationId);
      const validatedPatch = validateWithSchema(
        body,
        BYOKPreferencesPatchSchema,
        correlationId,
      );
      return await proxyByokOperation(
        req,
        env,
        {
          scope,
          method: "PATCH",
          path: "/providers/preferences",
          body: validatedPatch,
        },
        BYOKPreferencesSchema,
        correlationId,
      );
    } catch (error) {
      return handleByokError(req, env, error, correlationId);
    }
  }
}

async function proxyProviderOperation(
  req: Request,
  env: Env,
  operation: {
    scope: AuthorizedProviderScope;
    method: "GET" | "POST" | "PATCH";
    path: string;
    body?: unknown;
  },
): Promise<Response> {
  const id = env.RUN_ENGINE_RUNTIME.idFromName(operation.scope.runId);
  const stub = env.RUN_ENGINE_RUNTIME.get(id);
  const headers = new Headers({
    "X-Run-Id": operation.scope.runId,
    "X-User-Id": operation.scope.userId,
    "X-Workspace-Id": operation.scope.workspaceId,
  });

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

async function proxyByokOperation(
  req: Request,
  env: Env,
  operation: {
    scope: AuthorizedProviderScope;
    method: "GET" | "POST" | "PATCH";
    path: string;
    body?: unknown;
  },
  responseSchema: z.ZodSchema,
  correlationId: string,
): Promise<Response> {
  const response = await proxyProviderOperation(req, env, operation);
  if (!response.ok) {
    return await normalizeByokRuntimeError(
      req,
      env,
      response,
      operation.scope,
      correlationId,
    );
  }

  await validateProxyResponse(response, responseSchema, correlationId);
  return response;
}

async function validateProxyResponse(
  response: Response,
  schema: z.ZodSchema,
  correlationId: string,
): Promise<void> {
  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    throw new ValidationError(
      "Provider runtime returned non-JSON response",
      "INVALID_PROVIDER_RESPONSE",
      correlationId,
    );
  }
  validateWithSchema(payload, schema, correlationId);
}

async function normalizeByokRuntimeError(
  req: Request,
  env: Env,
  response: Response,
  scope: AuthorizedProviderScope,
  correlationId: string,
): Promise<Response> {
  const parsed = await parseErrorLikeBody(response);
  const code = normalizeProviderErrorCode(parsed.code, response.status);
  const message = parsed.message || "Provider request failed";
  const retryable = response.status >= 500 || code === "RATE_LIMITED";
  console.warn(
    `[provider/byok] ${correlationId}: runtime error ${code} (${response.status}) - ${message}`,
  );

  const normalized = new Response(
    JSON.stringify({
      error: {
        code,
        message,
        retryable,
        correlationId,
      },
    }),
    {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
  return withEngineHeaders(req, env, normalized, scope.runId);
}

async function parseErrorLikeBody(
  response: Response,
): Promise<{ code?: string; message?: string }> {
  try {
    const payload = await response.clone().json();
    if (!payload || typeof payload !== "object") {
      return {};
    }
    const raw = payload as Record<string, unknown>;
    const nestedError =
      raw.error && typeof raw.error === "object"
        ? (raw.error as Record<string, unknown>)
        : undefined;
    const code = typeof raw.code === "string"
      ? raw.code
      : typeof nestedError?.code === "string"
      ? nestedError.code
      : undefined;
    const message = typeof raw.error === "string"
      ? raw.error
      : typeof raw.message === "string"
      ? raw.message
      : typeof nestedError?.message === "string"
      ? nestedError.message
      : undefined;
    return { code, message };
  } catch {
    return {};
  }
}

function handleByokError(
  req: Request,
  env: Env,
  error: unknown,
  correlationId: string,
): Response {
  if (isDomainError(error)) {
    console.warn(
      `[provider/byok] ${correlationId}: ${error.code} - ${error.message}`,
    );
    return buildByokErrorResponse(req, env, {
      status: error.status,
      ...toNormalizedProviderError(error, correlationId),
    });
  }
  console.error(`[provider/byok] ${correlationId}: unexpected error`, error);
  return buildByokErrorResponse(req, env, {
    status: 500,
    ...toNormalizedProviderError(error, correlationId),
  });
}

function buildByokErrorResponse(
  req: Request,
  env: Env,
  input: {
    status: number;
    code?: string;
    message: string;
    retryable?: boolean;
    correlationId?: string;
  },
): Response {
  const code = normalizeProviderErrorCode(input.code, input.status);
  const retryable = input.retryable || input.status >= 500 || code === "RATE_LIMITED";
  return jsonResponse(
    req,
    env,
    {
      error: {
        code,
        message: input.message,
        retryable,
        correlationId: input.correlationId,
      },
    },
    { status: input.status },
  );
}
