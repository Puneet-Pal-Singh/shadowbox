import type { Env } from "../types/ai";
import { getCorsHeaders } from "../lib/cors";
import { getBrainRuntimeHeaders } from "../core/observability/runtime";
import { fetchRunRuntimeRoute } from "./chat-runtime-helpers";

type RuntimeOrchestratorBackend = "execution-engine-v1" | "cloudflare_agents";

interface RunSummaryResponse {
  runId: string;
  status: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  runningTasks: number;
  pendingTasks: number;
  cancelledTasks: number;
  eventCount?: number;
  lastEventType?: string | null;
}

interface RunActivityResponse {
  runId: string;
  sessionId: string;
  status: string;
  items: unknown[];
}

export class RunController {
  static async getSummary(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId")?.trim();
      const requestedBackend = parseRequestedBackend(
        url.searchParams.get("backend"),
      );

      if (!runId) {
        return errorResponse(req, env, "runId is required", 400);
      }

      const response = await fetchRunSummaryFromRuntime(
        env,
        runId,
        requestedBackend,
      );
      if (!response.ok) {
        const details = await readErrorPreview(response);
        const suffix = details ? `: ${details}` : "";
        return errorResponse(
          req,
          env,
          `Failed to fetch run summary${suffix}`,
          response.status,
        );
      }

      const payload = (await response.json()) as RunSummaryResponse;
      return jsonResponse(req, env, payload);
    } catch (error) {
      console.error("[RunController:getSummary] Error:", error);
      return errorResponse(
        req,
        env,
        error instanceof Error ? error.message : "Failed to fetch run summary",
        500,
      );
    }
  }

  static async cancel(req: Request, env: Env): Promise<Response> {
    try {
      const body = (await req.json().catch(() => null)) as {
        runId?: string;
        orchestratorBackend?: RuntimeOrchestratorBackend;
      } | null;
      const runId = body?.runId?.trim();
      const requestedBackend =
        body?.orchestratorBackend ?? "execution-engine-v1";
      if (!runId) {
        return errorResponse(req, env, "runId is required", 400);
      }

      const response = await fetchRunCancelFromRuntime(
        env,
        runId,
        requestedBackend,
      );
      if (!response.ok) {
        const details = await readErrorPreview(response);
        const suffix = details ? `: ${details}` : "";
        return errorResponse(
          req,
          env,
          `Failed to cancel run${suffix}`,
          response.status,
        );
      }

      const payload = (await response.json()) as unknown;
      return jsonResponse(req, env, payload);
    } catch (error) {
      console.error("[RunController:cancel] Error:", error);
      return errorResponse(
        req,
        env,
        error instanceof Error ? error.message : "Failed to cancel run",
        500,
      );
    }
  }

  static async getEvents(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId")?.trim();
      const requestedBackend = parseRequestedBackend(
        url.searchParams.get("backend"),
      );

      if (!runId) {
        return errorResponse(req, env, "runId is required", 400);
      }

      const response = await fetchRunEventsFromRuntime(
        env,
        runId,
        requestedBackend,
      );
      if (!response.ok) {
        const details = await readErrorPreview(response);
        const suffix = details ? `: ${details}` : "";
        return errorResponse(
          req,
          env,
          `Failed to fetch run events${suffix}`,
          response.status,
        );
      }

      return proxyResponse(req, env, response);
    } catch (error) {
      console.error("[RunController:getEvents] Error:", error);
      return errorResponse(
        req,
        env,
        error instanceof Error ? error.message : "Failed to fetch run events",
        500,
      );
    }
  }

  static async getEventsStream(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId")?.trim();
      const requestedBackend = parseRequestedBackend(
        url.searchParams.get("backend"),
      );

      if (!runId) {
        return errorResponse(req, env, "runId is required", 400);
      }

      const response = await fetchRunEventsStreamFromRuntime(
        env,
        runId,
        requestedBackend,
      );
      if (!response.ok) {
        const details = await readErrorPreview(response);
        const suffix = details ? `: ${details}` : "";
        return errorResponse(
          req,
          env,
          `Failed to stream run events${suffix}`,
          response.status,
        );
      }

      return proxyResponse(req, env, response);
    } catch (error) {
      console.error("[RunController:getEventsStream] Error:", error);
      return errorResponse(
        req,
        env,
        error instanceof Error ? error.message : "Failed to stream run events",
        500,
      );
    }
  }

  static async getActivity(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId")?.trim();
      const requestedBackend = parseRequestedBackend(
        url.searchParams.get("backend"),
      );

      if (!runId) {
        return errorResponse(req, env, "runId is required", 400);
      }

      const response = await fetchRunActivityFromRuntime(
        env,
        runId,
        requestedBackend,
      );
      if (!response.ok) {
        const details = await readErrorPreview(response);
        const suffix = details ? `: ${details}` : "";
        return errorResponse(
          req,
          env,
          `Failed to fetch run activity${suffix}`,
          response.status,
        );
      }

      const payload = (await response.json()) as RunActivityResponse;
      return jsonResponse(req, env, payload);
    } catch (error) {
      console.error("[RunController:getActivity] Error:", error);
      return errorResponse(
        req,
        env,
        error instanceof Error ? error.message : "Failed to fetch run activity",
        500,
      );
    }
  }
}

async function fetchRunSummaryFromRuntime(
  env: Env,
  runId: string,
  requestedBackend: RuntimeOrchestratorBackend,
): Promise<Response> {
  return fetchRunRuntimeRoute(env, runId, requestedBackend, {
    method: "GET",
    path: `/summary?runId=${encodeURIComponent(runId)}`,
  });
}

async function fetchRunCancelFromRuntime(
  env: Env,
  runId: string,
  requestedBackend: RuntimeOrchestratorBackend,
): Promise<Response> {
  return fetchRunRuntimeRoute(env, runId, requestedBackend, {
    method: "POST",
    path: "/cancel",
    body: JSON.stringify({ runId }),
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function fetchRunEventsFromRuntime(
  env: Env,
  runId: string,
  requestedBackend: RuntimeOrchestratorBackend,
): Promise<Response> {
  return fetchRunRuntimeRoute(env, runId, requestedBackend, {
    method: "GET",
    path: `/events?runId=${encodeURIComponent(runId)}`,
  });
}

async function fetchRunEventsStreamFromRuntime(
  env: Env,
  runId: string,
  requestedBackend: RuntimeOrchestratorBackend,
): Promise<Response> {
  return fetchRunRuntimeRoute(env, runId, requestedBackend, {
    method: "GET",
    path: `/events/stream?runId=${encodeURIComponent(runId)}`,
  });
}

async function fetchRunActivityFromRuntime(
  env: Env,
  runId: string,
  requestedBackend: RuntimeOrchestratorBackend,
): Promise<Response> {
  return fetchRunRuntimeRoute(env, runId, requestedBackend, {
    method: "GET",
    path: `/activity?runId=${encodeURIComponent(runId)}`,
  });
}

function parseRequestedBackend(
  value: string | null,
): RuntimeOrchestratorBackend {
  if (value === "cloudflare_agents") {
    return value;
  }
  return "execution-engine-v1";
}

function jsonResponse(
  req: Request,
  env: Env,
  data: unknown,
  status: number = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getBrainRuntimeHeaders(env),
      ...getCorsHeaders(req, env),
    },
  });
}

function proxyResponse(req: Request, env: Env, response: Response): Response {
  const contentType =
    response.headers.get("Content-Type") ??
    "application/x-ndjson; charset=utf-8";

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": contentType,
      ...getBrainRuntimeHeaders(env),
      ...getCorsHeaders(req, env),
    },
  });
}

function errorResponse(
  req: Request,
  env: Env,
  message: string,
  status: number,
): Response {
  return jsonResponse(req, env, { error: message }, status);
}

async function readErrorPreview(response: Response): Promise<string> {
  try {
    const payload = (await response.clone().json()) as { error?: string };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error.trim();
    }
  } catch {
    // No-op: fallback to text preview.
  }

  try {
    const text = (await response.text()).trim();
    if (text.length > 0) {
      return text.slice(0, 200);
    }
  } catch {
    // No-op
  }

  return "";
}
