import type { Env } from "../types/ai";
import { jsonResponse } from "../http/response";
import { buildBrainRuntimeDebugPayload } from "../core/observability/runtime";

export class RuntimeController {
  static async getRuntimeDebug(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const runId = url.searchParams.get("runId")?.trim();
    const payload: Record<string, unknown> = {
      worker: buildBrainRuntimeDebugPayload(env),
    };

    if (runId) {
      payload.runEngineRuntime = await fetchRunEngineRuntimeDebug(env, runId);
    }

    return jsonResponse(req, env, payload);
  }
}

async function fetchRunEngineRuntimeDebug(
  env: Env,
  runId: string,
): Promise<unknown> {
  if (!env.RUN_ENGINE_RUNTIME) {
    return {
      available: false,
      error: "RUN_ENGINE_RUNTIME binding is unavailable",
    };
  }

  try {
    const id = env.RUN_ENGINE_RUNTIME.idFromName(runId);
    const stub = env.RUN_ENGINE_RUNTIME.get(id);
    const response = (await stub.fetch("https://run-engine/debug/runtime", {
      method: "GET",
    })) as unknown as Response;

    if (!response.ok) {
      const error = await readResponsePreview(response);
      return {
        available: false,
        error: error || `RunEngine runtime debug returned ${response.status}`,
        status: response.status,
      };
    }

    const debugPayload = (await response.json()) as Record<string, unknown>;

    return {
      available: true,
      ...debugPayload,
    };
  } catch (error: unknown) {
    return {
      available: false,
      error:
        error instanceof Error ? error.message : "Unknown runtime debug error",
    };
  }
}

async function readResponsePreview(response: Response): Promise<string> {
  try {
    const payload = (await response.clone().json()) as { error?: string };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error.trim();
    }
  } catch {
    // No-op.
  }

  try {
    const text = (await response.text()).trim();
    return text.slice(0, 200);
  } catch {
    return "";
  }
}
