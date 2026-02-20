import type { DurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage } from "ai";
import { afterEach, describe, it, expect, vi } from "vitest";

// NOTE: This contract test intentionally lives in src/integration because the
// PR3 readiness gate executes the exact path:
// `pnpm --filter @shadowbox/brain test -- src/integration/provider-state.contract.test.ts`
// Keep this location aligned with the documented gate in:
// plans/codex-like-app/Top-version/16-AUDIT-CLOSURE-AND-BYOK-READINESS-LLD.md
import type { ProviderId } from "../schemas/provider";
import type { Env } from "../types/ai";
import { ProviderController } from "../controllers/ProviderController";
import { AIService } from "../services/AIService";
import { ProviderConfigService } from "../services/providers";
import { DurableProviderStore } from "../services/providers/DurableProviderStore";
import { OpenAICompatibleAdapter } from "../services/providers/adapters/OpenAICompatibleAdapter";
import {
  getRuntimeProviderFromAdapter,
  mapProviderIdToRuntimeProvider,
  resolveModelSelection,
} from "../services/ai/ModelSelectionPolicy";
import { setCompatModeOverride } from "../config/runtime-compat";

interface MockDurableObjectState {
  storage?: {
    put: (key: string, value: string) => Promise<void>;
    get: (key: string) => Promise<string | undefined>;
    delete: (key: string) => Promise<void>;
    list: (
      options?: { prefix: string },
    ) => Promise<Map<string, string> | undefined>;
  };
}

const RUN_ID = "123e4567-e89b-42d3-a456-426614174001";

describe("Provider State Contract: Controller/Runtime Shared Ownership", () => {
  afterEach(() => {
    setCompatModeOverride(false);
    vi.restoreAllMocks();
  });

  it("uses one durable provider-state owner path across controller and runtime services", async () => {
    const storageByRunId = new Map<string, Map<string, string>>();
    const env = createEnvWithRunNamespace(storageByRunId);

    const connectResponse = await ProviderController.connect(
      new Request("http://localhost/api/providers/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Run-Id": RUN_ID,
        },
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "sk-test-provider-state-1234567890",
        }),
      }),
      env,
    );
    expect(connectResponse.status).toBe(200);

    const statusResponse = await ProviderController.status(
      new Request("http://localhost/api/providers/status", {
        method: "GET",
        headers: {
          "X-Run-Id": RUN_ID,
        },
      }),
      env,
    );
    const statusBody = await statusResponse.json();
    expect(statusResponse.status).toBe(200);
    expect(
      statusBody.providers.some(
        (provider: { providerId: string; status: string }) =>
          provider.providerId === "openai" && provider.status === "connected",
      ),
    ).toBe(true);

    const modelsResponse = await ProviderController.models(
      new Request(
        "http://localhost/api/providers/models?providerId=openai",
        {
          method: "GET",
          headers: {
            "X-Run-Id": RUN_ID,
          },
        },
      ),
      env,
    );
    expect(modelsResponse.status).toBe(200);

    const runtimeProviderConfig = createRuntimeProviderConfigService(
      env,
      storageByRunId,
      RUN_ID,
    );
    const runtimeApiKey = await runtimeProviderConfig.getApiKey("openai");
    expect(runtimeApiKey).toBe("sk-test-provider-state-1234567890");

    const generateSpy = vi
      .spyOn(OpenAICompatibleAdapter.prototype, "generate")
      .mockResolvedValue({
        content: "integration-inference-ok",
        usage: {
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 3,
          completionTokens: 2,
          totalTokens: 5,
        },
      });

    const aiService = new AIService(env, runtimeProviderConfig);
    const messages: CoreMessage[] = [{ role: "user", content: "hello" }];
    const inferenceResult = await aiService.generateText({
      messages,
      providerId: "openai",
      model: "gpt-4o",
    });

    expect(inferenceResult.text).toBe("integration-inference-ok");
    expect(inferenceResult.usage.provider).toBe("openai");
    expect(inferenceResult.usage.model).toBe("gpt-4o");
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it("retains provider state across runtime restart for the same runId scope", async () => {
    const storageByRunId = new Map<string, Map<string, string>>();
    const env = createEnvWithRunNamespace(storageByRunId);

    await ProviderController.connect(
      new Request("http://localhost/api/providers/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Run-Id": RUN_ID,
        },
        body: JSON.stringify({
          providerId: "groq",
          apiKey: "gsk_test_provider_state_1234567890",
        }),
      }),
      env,
    );

    const runtimeServiceBeforeRestart = createRuntimeProviderConfigService(
      env,
      storageByRunId,
      RUN_ID,
    );
    expect(await runtimeServiceBeforeRestart.isConnected("groq")).toBe(true);

    // Simulate runtime restart by rebuilding runtime service from same durable storage.
    const runtimeServiceAfterRestart = createRuntimeProviderConfigService(
      env,
      storageByRunId,
      RUN_ID,
    );
    expect(await runtimeServiceAfterRestart.isConnected("groq")).toBe(true);
    expect(await runtimeServiceAfterRestart.getApiKey("groq")).toBe(
      "gsk_test_provider_state_1234567890",
    );
  });

  it("enforces strict-mode provider/model mismatch with explicit typed errors", () => {
    setCompatModeOverride(false);

    expectDomainError(() =>
      resolveModelSelection(
        "openai",
        "llama-3.3-70b-versatile",
        "litellm",
        "llama-3.3-70b-versatile",
        mapProviderIdToRuntimeProvider,
        getRuntimeProviderFromAdapter,
      ),
      "MODEL_NOT_ALLOWED",
    );

    expectDomainError(() =>
      resolveModelSelection(
        "invalid-provider",
        "gpt-4o",
        "litellm",
        "llama-3.3-70b-versatile",
        mapProviderIdToRuntimeProvider,
        getRuntimeProviderFromAdapter,
      ),
      "INVALID_PROVIDER_SELECTION",
    );
  });
});

function createEnvWithRunNamespace(
  storageByRunId: Map<string, Map<string, string>>,
): Env {
  const namespace = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(String(input), init);
        const runId = request.headers.get("X-Run-Id");
        if (!runId) {
          return new Response(
            JSON.stringify({ error: "Missing required X-Run-Id header" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (runId !== id) {
          return new Response(
            JSON.stringify({ error: `X-Run-Id mismatch: expected ${id}` }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const configService = createRuntimeProviderConfigService(
          env,
          storageByRunId,
          runId,
        );
        const url = new URL(request.url);
        return handleProviderRuntimeRoute(request, url, configService);
      },
    }),
  };

  const env = {
    RUN_ENGINE_RUNTIME: namespace as unknown as Env["RUN_ENGINE_RUNTIME"],
    LLM_PROVIDER: "litellm",
    DEFAULT_MODEL: "llama-3.3-70b-versatile",
    GROQ_API_KEY: "test-key",
    OPENAI_API_KEY: "sk-env-openai-key",
  } as unknown as Env;

  return env;
}

async function handleProviderRuntimeRoute(
  request: Request,
  url: URL,
  configService: ProviderConfigService,
): Promise<Response> {
  if (url.pathname === "/providers/connect" && request.method === "POST") {
    const body = (await request.json()) as {
      providerId: ProviderId;
      apiKey: string;
    };
    const response = await configService.connect(body);
    return json(response, 200);
  }

  if (url.pathname === "/providers/disconnect" && request.method === "POST") {
    const body = (await request.json()) as {
      providerId: ProviderId;
    };
    const response = await configService.disconnect(body);
    return json(response, 200);
  }

  if (url.pathname === "/providers/status" && request.method === "GET") {
    const providers = await configService.getStatus();
    return json({ providers }, 200);
  }

  if (url.pathname === "/providers/models" && request.method === "GET") {
    const providerId = url.searchParams.get("providerId") as ProviderId | null;
    if (!providerId) {
      return json({ error: "Missing required query parameter: providerId" }, 400);
    }
    const response = await configService.getModels(providerId);
    return json(response, 200);
  }

  return new Response("Not Found", { status: 404 });
}

function createRuntimeProviderConfigService(
  env: Env,
  storageByRunId: Map<string, Map<string, string>>,
  runId: string,
): ProviderConfigService {
  const state = createDurableState(storageByRunId, runId);
  const durableStore = new DurableProviderStore(
    state as unknown as DurableObjectState,
    runId,
  );
  return new ProviderConfigService(env, durableStore);
}

function createDurableState(
  storageByRunId: Map<string, Map<string, string>>,
  runId: string,
): MockDurableObjectState {
  if (!storageByRunId.has(runId)) {
    storageByRunId.set(runId, new Map<string, string>());
  }
  const data = storageByRunId.get(runId)!;

  return {
    storage: {
      put: async (key: string, value: string) => {
        data.set(key, value);
      },
      get: async (key: string) => data.get(key),
      delete: async (key: string) => {
        data.delete(key);
      },
      list: async (options?: { prefix: string }) => {
        const prefix = options?.prefix ?? "";
        const entries = new Map<string, string>();
        for (const [key, value] of data) {
          if (key.startsWith(prefix)) {
            entries.set(key, value);
          }
        }
        return entries;
      },
    },
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function expectDomainError(
  run: () => unknown,
  expectedCode: string,
): void {
  try {
    run();
    throw new Error(`Expected error with code ${expectedCode}`);
  } catch (error) {
    expect(error).toMatchObject({ code: expectedCode });
  }
}
