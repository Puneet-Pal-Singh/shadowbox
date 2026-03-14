import type { Env } from "../types/ai";
import { getCorsHeaders } from "../lib/cors";
import { getBrainRuntimeHeaders } from "../core/observability/runtime";

interface RunSummaryResponse {
  runId: string;
  status: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  runningTasks: number;
  pendingTasks: number;
  cancelledTasks: number;
}

export class RunController {
  static async getSummary(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId")?.trim();

      if (!runId) {
        return errorResponse(req, env, "runId is required", 400);
      }

      const response = await fetchRunSummaryFromRuntime(env, runId);
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
      } | null;
      const runId = body?.runId?.trim();
      if (!runId) {
        return errorResponse(req, env, "runId is required", 400);
      }

      const response = await fetchRunCancelFromRuntime(env, runId);
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
}

async function fetchRunSummaryFromRuntime(
  env: Env,
  runId: string,
): Promise<Response> {
  return fetchFromRuntime(env, runId, {
    method: "GET",
    path: `/summary?runId=${encodeURIComponent(runId)}`,
  });
}

async function fetchRunCancelFromRuntime(
  env: Env,
  runId: string,
): Promise<Response> {
  return fetchFromRuntime(env, runId, {
    method: "POST",
    path: "/cancel",
    body: JSON.stringify({ runId }),
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function fetchFromRuntime(
  env: Env,
  runId: string,
  requestInit: {
    method: "GET" | "POST";
    path: string;
    body?: string;
    headers?: Record<string, string>;
  },
): Promise<Response> {
  if (!env.RUN_ENGINE_RUNTIME) {
    throw new Error("RUN_ENGINE_RUNTIME binding is unavailable");
  }

  const id = env.RUN_ENGINE_RUNTIME.idFromName(runId);
  const stub = env.RUN_ENGINE_RUNTIME.get(id);
  return (await stub.fetch(`https://run-engine${requestInit.path}`, {
    method: requestInit.method,
    headers: requestInit.headers,
    body: requestInit.body,
  })) as unknown as Response;
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
