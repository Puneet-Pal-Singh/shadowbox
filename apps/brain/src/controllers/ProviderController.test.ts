import { describe, it, expect } from "vitest";
import { ProviderController } from "./ProviderController";
import type { Env } from "../types/ai";
import type { ProviderId } from "@repo/shared-types";

const TEST_RUN_ID = "123e4567-e89b-42d3-a456-426614174000";
const TEST_USER_ID = "user-123";
const TEST_WORKSPACE_ID = "workspace-main";
const TEST_SESSION_SECRET = "test-session-secret";

function createMockEnv(): Env {
  const providerState = new Map<string, Set<ProviderId>>();
  const preferencesState = new Map<
    string,
    { defaultProviderId?: ProviderId; defaultModelId?: string; updatedAt: string }
  >();
  const sessions = new Map<string, string>();
  sessions.set(
    `user_session:${TEST_USER_ID}`,
    JSON.stringify({
      userId: TEST_USER_ID,
      workspaceIds: [TEST_WORKSPACE_ID],
      defaultWorkspaceId: TEST_WORKSPACE_ID,
    }),
  );

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
        const userId = request.headers.get("X-User-Id");
        const workspaceId = request.headers.get("X-Workspace-Id");

        if (!runId || runId !== id) {
          return jsonError("Missing required X-Run-Id header", 400);
        }

        if (userId !== TEST_USER_ID || workspaceId !== TEST_WORKSPACE_ID) {
          return jsonError("Invalid BYOK scope", 403, "AUTH_FAILED");
        }

        const scopeKey = `${userId}:${workspaceId}`;
        if (!providerState.has(scopeKey)) {
          providerState.set(scopeKey, new Set<ProviderId>());
        }
        const connectedProviders = providerState.get(scopeKey)!;

        if (url.pathname === "/providers/connect" && request.method === "POST") {
          const body = (await request.json()) as { providerId: ProviderId };
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
          const body = (await request.json()) as { providerId: ProviderId };
          connectedProviders.delete(body.providerId);
          return jsonOk({
            status: "disconnected",
            providerId: body.providerId,
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
          request.method === "GET"
        ) {
          const current = preferencesState.get(scopeKey) ?? {
            updatedAt: new Date().toISOString(),
          };
          return jsonOk(current);
        }

        if (
          url.pathname === "/providers/preferences" &&
          request.method === "PATCH"
        ) {
          const body = (await request.json()) as {
            defaultProviderId?: ProviderId;
            defaultModelId?: string;
          };
          const current = preferencesState.get(scopeKey) ?? {
            updatedAt: new Date().toISOString(),
          };
          const next = {
            defaultProviderId: body.defaultProviderId ?? current.defaultProviderId,
            defaultModelId: body.defaultModelId ?? current.defaultModelId,
            updatedAt: new Date().toISOString(),
          };
          preferencesState.set(scopeKey, next);
          return jsonOk(next);
        }

        return new Response("Not Found", { status: 404 });
      },
    }),
  };

  return {
    RUN_ENGINE_RUNTIME: namespace as unknown as Env["RUN_ENGINE_RUNTIME"],
    SESSION_SECRET: TEST_SESSION_SECRET,
    SESSIONS: {
      get: async (key: string) => sessions.get(key) ?? null,
      put: async (key: string, value: string) => {
        sessions.set(key, value);
      },
      delete: async (key: string) => {
        sessions.delete(key);
      },
    } as unknown as Env["SESSIONS"],
    LLM_PROVIDER: "litellm",
    DEFAULT_MODEL: "llama-3.3-70b-versatile",
    GROQ_API_KEY: "test-key",
  } as unknown as Env;
}

async function withByokHeaders(
  env: Env,
  headers: Record<string, string> = {},
): Promise<Record<string, string>> {
  const token = await createSessionToken(TEST_USER_ID, env.SESSION_SECRET);
  return {
    "Content-Type": "application/json",
    "X-Run-Id": TEST_RUN_ID,
    Cookie: `shadowbox_session=${token}`,
    ...headers,
  };
}

async function createSessionToken(userId: string, secret: string): Promise<string> {
  const timestamp = Date.now().toString();
  const data = `${userId}:${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data),
  );
  const signature = btoa(
    String.fromCharCode(...new Uint8Array(signatureBuffer)),
  );
  return `${data}:${signature}`;
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
        headers: await withByokHeaders(env),
      });

      const response = await ProviderController.byokConnect(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("connected");
      expect(data.providerId).toBe("openai");
    });

    it("fails connect without runId", async () => {
      const env = createMockEnv();
      const headers = await withByokHeaders(env);
      delete headers["X-Run-Id"];

      const request = new Request("http://localhost/api/byok/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "sk-test-1234567890",
        }),
        headers,
      });

      const response = await ProviderController.byokConnect(request, env);
      expect(response.status).toBe(400);
    });

    it("rejects requests without valid auth claims", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/api/byok/providers/catalog", {
        method: "GET",
        headers: { "X-Run-Id": TEST_RUN_ID },
      });

      const response = await ProviderController.byokCatalog(request, env);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe("AUTH_FAILED");
    });

    it("rejects client-supplied user scope mismatch", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/api/byok/providers/catalog", {
        method: "GET",
        headers: await withByokHeaders(env, { "X-User-Id": "different-user" }),
      });

      const response = await ProviderController.byokCatalog(request, env);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe("AUTH_FAILED");
    });

    it("rejects unauthorized workspace scope", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/api/byok/providers/catalog", {
        method: "GET",
        headers: await withByokHeaders(env, {
          "X-Workspace-Id": "workspace-other",
        }),
      });

      const response = await ProviderController.byokCatalog(request, env);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe("AUTH_FAILED");
    });

    it("rejects legacy query scope parameters", async () => {
      const env = createMockEnv();
      const request = new Request(
        `http://localhost/api/byok/providers/catalog?runId=${TEST_RUN_ID}`,
        {
          method: "GET",
          headers: await withByokHeaders(env),
        },
      );

      const response = await ProviderController.byokCatalog(request, env);
      expect(response.status).toBe(400);
    });

    it("returns provider catalog", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/api/byok/providers/catalog", {
        method: "GET",
        headers: await withByokHeaders(env),
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
          headers: await withByokHeaders(env),
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
          headers: await withByokHeaders(env),
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
          headers: await withByokHeaders(env),
        }),
        env,
      );

      const request = new Request("http://localhost/api/byok/providers/disconnect", {
        method: "POST",
        body: JSON.stringify({ providerId: "openai" }),
        headers: await withByokHeaders(env),
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
          headers: await withByokHeaders(env),
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
      const patchResponse = await ProviderController.byokPreferences(
        new Request("http://localhost/api/byok/preferences", {
          method: "PATCH",
          headers: await withByokHeaders(env),
          body: JSON.stringify({
            defaultProviderId: "groq",
            defaultModelId: "llama-3.3-70b-versatile",
          }),
        }),
        env,
      );
      const patchData = await patchResponse.json();

      expect(patchResponse.status).toBe(200);
      expect(patchData.defaultProviderId).toBe("groq");
      expect(patchData.defaultModelId).toBe("llama-3.3-70b-versatile");
      expect(typeof patchData.updatedAt).toBe("string");

      const getResponse = await ProviderController.byokGetPreferences(
        new Request("http://localhost/api/byok/preferences", {
          method: "GET",
          headers: await withByokHeaders(env, { "Content-Type": undefined }),
        }),
        env,
      );
      const getData = await getResponse.json();

      expect(getResponse.status).toBe(200);
      expect(getData.defaultProviderId).toBe("groq");
      expect(getData.defaultModelId).toBe("llama-3.3-70b-versatile");
      expect(typeof getData.updatedAt).toBe("string");
    });
  });
});
