import { describe, it, expect } from "vitest";
import { ProviderController } from "./ProviderController";
import type { Env } from "../types/ai";
import type { ProviderId } from "../schemas/provider";

const TEST_RUN_ID = "123e4567-e89b-42d3-a456-426614174000";

function createMockEnv(): Env {
  const providerState = new Map<string, Set<ProviderId>>();
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

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ProviderController", () => {
  describe("connect", () => {
    it("connects provider with valid API key", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/api/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "sk-test-1234567890",
        }),
        headers: withRunIdHeaders(),
      });

      const response = await ProviderController.connect(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("connected");
      expect(data.providerId).toBe("openai");
    });

    it("fails without runId", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/api/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "sk-test-1234567890",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.connect(request, env);
      expect(response.status).toBe(400);
    });
  });

  describe("disconnect", () => {
    it("disconnects a connected provider", async () => {
      const env = createMockEnv();

      await ProviderController.connect(
        new Request("http://localhost/api/providers/connect", {
          method: "POST",
          body: JSON.stringify({
            providerId: "openai",
            apiKey: "sk-test-1234567890",
          }),
          headers: withRunIdHeaders(),
        }),
        env,
      );

      const request = new Request("http://localhost/api/providers/disconnect", {
        method: "POST",
        body: JSON.stringify({ providerId: "openai" }),
        headers: withRunIdHeaders(),
      });

      const response = await ProviderController.disconnect(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("disconnected");
      expect(data.providerId).toBe("openai");
    });
  });

  describe("status", () => {
    it("returns provider statuses for the run scope", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/api/providers/status", {
        method: "GET",
        headers: { "X-Run-Id": TEST_RUN_ID },
      });

      const response = await ProviderController.status(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data.providers)).toBe(true);
      expect(data.providers).toHaveLength(3);
    });
  });

  describe("models", () => {
    it("returns models for a provider", async () => {
      const env = createMockEnv();
      const request = new Request(
        "http://localhost/api/providers/models?providerId=openai",
        {
          method: "GET",
          headers: { "X-Run-Id": TEST_RUN_ID },
        },
      );

      const response = await ProviderController.models(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.providerId).toBe("openai");
      expect(Array.isArray(data.models)).toBe(true);
      expect(data.models.length).toBeGreaterThan(0);
    });

    it("fails when providerId query parameter is missing", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/api/providers/models", {
        method: "GET",
        headers: { "X-Run-Id": TEST_RUN_ID },
      });

      const response = await ProviderController.models(request, env);
      expect(response.status).toBe(400);
    });
  });
});
