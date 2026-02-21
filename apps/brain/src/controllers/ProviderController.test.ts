import { describe, it, expect } from "vitest";
import { ProviderController } from "./ProviderController";
import type { Env } from "../types/ai";
import type { ProviderId } from "../schemas/provider";

const TEST_RUN_ID = "123e4567-e89b-42d3-a456-426614174000";

function createMockEnv(): Env {
  const providerState = new Map<string, Set<ProviderId>>();
  const preferencesState = new Map<
    string,
    { defaultProviderId?: ProviderId; defaultModelId?: string; updatedAt: string }
  >();
  const catalog: Record<ProviderId, Array<{ id: string; name: string }>> = {
    openai: [{ id: "gpt-4o", name: "GPT-4o" }],
    openrouter: [{ id: "openrouter/auto", name: "Auto" }],
    groq: [{ id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" }],
  };

  const namespace = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(String(input), init);
        const url = new URL(request.url);
        const runId = request.headers.get("X-Run-Id");

        if (!runId || runId !== id) {
          return jsonError("Missing required X-Run-Id header", 400);
        }

        if (!providerState.has(runId)) {
          providerState.set(runId, new Set<ProviderId>());
        }
        const connectedProviders = providerState.get(runId)!;

        if (url.pathname === "/providers/connect" && request.method === "POST") {
          const body = (await request.json()) as {
            providerId: ProviderId;
          };
          connectedProviders.add(body.providerId);
          return jsonOk({
            status: "connected",
            providerId: body.providerId,
            lastValidatedAt: new Date().toISOString(),
          });
        }

        if (
          url.pathname === "/providers/disconnect" &&
          request.method === "POST"
        ) {
          const body = (await request.json()) as {
            providerId: ProviderId;
          };
          connectedProviders.delete(body.providerId);
          return jsonOk({
            status: "disconnected",
            providerId: body.providerId,
          });
        }

        if (url.pathname === "/providers/status" && request.method === "GET") {
          return jsonOk({
            providers: (["openrouter", "openai", "groq"] as ProviderId[]).map(
              (providerId) => ({
                providerId,
                status: connectedProviders.has(providerId)
                  ? "connected"
                  : "disconnected",
              }),
            ),
          });
        }

        if (url.pathname === "/providers/models" && request.method === "GET") {
          const providerId = url.searchParams.get("providerId") as
            | ProviderId
            | null;
          if (!providerId || !catalog[providerId]) {
            return jsonError("Invalid providerId", 400);
          }
          return jsonOk({
            providerId,
            models: catalog[providerId].map((model) => ({
              ...model,
              provider: providerId,
            })),
            lastFetchedAt: new Date().toISOString(),
          });
        }

        if (url.pathname === "/providers/catalog" && request.method === "GET") {
          return jsonOk({
            providers: (["openrouter", "openai", "groq"] as ProviderId[]).map(
              (providerId) => ({
                providerId,
                displayName: providerId.toUpperCase(),
                capabilities: {
                  streaming: true,
                  tools: true,
                  structuredOutputs: true,
                  jsonMode: true,
                },
                models: catalog[providerId].map((model) => ({
                  ...model,
                  provider: providerId,
                })),
              }),
            ),
            generatedAt: new Date().toISOString(),
          });
        }

        if (
          url.pathname === "/providers/connections" &&
          request.method === "GET"
        ) {
          return jsonOk({
            connections: (["openrouter", "openai", "groq"] as ProviderId[]).map(
              (providerId) => ({
                providerId,
                status: connectedProviders.has(providerId)
                  ? "connected"
                  : "disconnected",
                capabilities: {
                  streaming: true,
                  tools: true,
                  structuredOutputs: true,
                  jsonMode: true,
                },
              }),
            ),
          });
        }

        if (url.pathname === "/providers/validate" && request.method === "POST") {
          const body = (await request.json()) as { providerId: ProviderId };
          if (!connectedProviders.has(body.providerId)) {
            return jsonError(
              `Provider "${body.providerId}" is not connected.`,
              400,
              "PROVIDER_NOT_CONNECTED",
            );
          }
          return jsonOk({
            providerId: body.providerId,
            status: "valid",
            checkedAt: new Date().toISOString(),
          });
        }

        if (
          url.pathname === "/providers/preferences" &&
          request.method === "PATCH"
        ) {
          const body = (await request.json()) as {
            defaultProviderId?: ProviderId;
            defaultModelId?: string;
          };
          const current = preferencesState.get(runId) ?? {
            updatedAt: new Date().toISOString(),
          };
          const next = {
            defaultProviderId: body.defaultProviderId ?? current.defaultProviderId,
            defaultModelId: body.defaultModelId ?? current.defaultModelId,
            updatedAt: new Date().toISOString(),
          };
          preferencesState.set(runId, next);
          return jsonOk(next);
        }

        return new Response("Not Found", { status: 404 });
      },
    }),
  };

  return {
    RUN_ENGINE_RUNTIME: namespace as unknown as Env["RUN_ENGINE_RUNTIME"],
    LLM_PROVIDER: "litellm",
    DEFAULT_MODEL: "llama-3.3-70b-versatile",
    GROQ_API_KEY: "test-key",
  } as unknown as Env;
}

function withRunIdHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Run-Id": TEST_RUN_ID,
    ...headers,
  };
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number, code?: string): Response {
  const body = code ? { error: message, code } : { error: message };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ProviderController", () => {
  describe("byok v2", () => {
    it("connects provider with valid API key", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/api/byok/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "sk-test-1234567890",
        }),
        headers: withRunIdHeaders(),
      });

      const response = await ProviderController.byokConnect(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("connected");
      expect(data.providerId).toBe("openai");
    });

    it("fails connect without runId", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/api/byok/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "sk-test-1234567890",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.byokConnect(request, env);
      expect(response.status).toBe(400);
    });

    it("returns provider catalog", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/api/byok/providers/catalog", {
        method: "GET",
        headers: { "X-Run-Id": TEST_RUN_ID },
      });

      const response = await ProviderController.byokCatalog(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data.providers)).toBe(true);
      expect(data.providers[0].capabilities.streaming).toBe(true);
    });

    it("returns connections after byok connect", async () => {
      const env = createMockEnv();
      await ProviderController.byokConnect(
        new Request("http://localhost/api/byok/providers/connect", {
          method: "POST",
          headers: withRunIdHeaders(),
          body: JSON.stringify({
            providerId: "openai",
            apiKey: "sk-test-1234567890",
          }),
        }),
        env,
      );

      const response = await ProviderController.byokConnections(
        new Request("http://localhost/api/byok/providers/connections", {
          method: "GET",
          headers: { "X-Run-Id": TEST_RUN_ID },
        }),
        env,
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(
        data.connections.some(
          (connection: { providerId: string; status: string }) =>
            connection.providerId === "openai" &&
            connection.status === "connected",
        ),
      ).toBe(true);
    });

    it("disconnects a connected provider", async () => {
      const env = createMockEnv();

      await ProviderController.byokConnect(
        new Request("http://localhost/api/byok/providers/connect", {
          method: "POST",
          body: JSON.stringify({
            providerId: "openai",
            apiKey: "sk-test-1234567890",
          }),
          headers: withRunIdHeaders(),
        }),
        env,
      );

      const request = new Request("http://localhost/api/byok/providers/disconnect", {
        method: "POST",
        body: JSON.stringify({ providerId: "openai" }),
        headers: withRunIdHeaders(),
      });

      const response = await ProviderController.byokDisconnect(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("disconnected");
      expect(data.providerId).toBe("openai");
    });

    it("returns normalized error envelope for validate on disconnected provider", async () => {
      const env = createMockEnv();
      const response = await ProviderController.byokValidate(
        new Request("http://localhost/api/byok/providers/validate", {
          method: "POST",
          headers: withRunIdHeaders(),
          body: JSON.stringify({ providerId: "openai" }),
        }),
        env,
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe("PROVIDER_NOT_CONNECTED");
      expect(data.error.retryable).toBe(false);
      expect(typeof data.error.correlationId).toBe("string");
    });

    it("stores and returns preferences", async () => {
      const env = createMockEnv();
      const response = await ProviderController.byokPreferences(
        new Request("http://localhost/api/byok/preferences", {
          method: "PATCH",
          headers: withRunIdHeaders(),
          body: JSON.stringify({
            defaultProviderId: "groq",
            defaultModelId: "llama-3.3-70b-versatile",
          }),
        }),
        env,
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.defaultProviderId).toBe("groq");
      expect(data.defaultModelId).toBe("llama-3.3-70b-versatile");
      expect(typeof data.updatedAt).toBe("string");
    });
  });
});
