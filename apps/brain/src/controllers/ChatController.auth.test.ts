import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatController } from "./ChatController";
import type { Env } from "../types/ai";

const VALID_RUN_ID = "123e4567-e89b-42d3-a456-426614174000";
const TEST_USER_ID = "user-123";
const TEST_WORKSPACE_ID = "workspace-main";

vi.mock("@shadowbox/orchestrator-adapters-cloudflare-agents", () => ({
  CloudflareAgent: class MockCloudflareAgent {},
  CloudflareAgentsRunRuntimeClient: class MockRuntimeClient {
    execute = vi.fn();
    getSummary = vi.fn();
    cancel = vi.fn();
  },
  parseCloudflareAgentsFeatureFlag: (value: string | undefined) =>
    value === "true" || value === "1",
  shouldActivateCloudflareAgentsAdapter: ({
    requestedBackend,
    featureFlagEnabled,
  }: {
    requestedBackend: string;
    featureFlagEnabled: boolean;
  }) => featureFlagEnabled && requestedBackend === "cloudflare_agents",
}));

describe("ChatController auth contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns typed AUTH_FAILED when chat request has no auth token", async () => {
    const runtime = createMockRuntimeNamespace();
    const env = createEnv(runtime.namespace);

    const response = await ChatController.handle(createChatRequest(), env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_FAILED",
      error: "Unauthorized: missing authentication token.",
    });
    expect(runtime.fetch).not.toHaveBeenCalled();
  });

  it("accepts authenticated chat requests and forwards resolved scope", async () => {
    const runtime = createMockRuntimeNamespace();
    const env = createEnv(runtime.namespace);
    const token = await createSessionToken(TEST_USER_ID, env.SESSION_SECRET);

    const response = await ChatController.handle(
      createChatRequest({
        headers: {
          Cookie: `shadowbox_session=${token}`,
        },
      }),
      env,
    );

    expect(response.status).toBe(200);
    const fetchCall = runtime.fetch.mock.calls[0];
    expect(fetchCall).toBeDefined();
    const payload = JSON.parse((fetchCall?.[1] as { body: string }).body) as {
      userId?: string;
      workspaceId?: string;
    };

    expect(payload.userId).toBe(TEST_USER_ID);
    expect(payload.workspaceId).toBe(TEST_WORKSPACE_ID);
  });
});

function createChatRequest(options?: {
  headers?: Record<string, string>;
}): Request {
  return new Request("https://brain.local/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    body: JSON.stringify({
      sessionId: "session-1",
      runId: VALID_RUN_ID,
      messages: [
        {
          role: "user",
          content: "hello",
        },
      ],
    }),
  });
}

function createMockRuntimeNamespace() {
  const fetch = vi.fn(async () => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const get = vi.fn(() => ({ fetch }));
  const idFromName = vi.fn(() => ({ toString: () => "mock-do-id" }));

  const namespace = {
    idFromName,
    get,
  } as unknown as Env["RUN_ENGINE_RUNTIME"];

  return { namespace, fetch };
}

function createEnv(runEngineRuntime: Env["RUN_ENGINE_RUNTIME"]): Env {
  const sessions = new Map<string, string>();
  sessions.set(
    `user_session:${TEST_USER_ID}`,
    JSON.stringify({
      userId: TEST_USER_ID,
      workspaceIds: [TEST_WORKSPACE_ID],
      defaultWorkspaceId: TEST_WORKSPACE_ID,
    }),
  );

  return {
    AI: {} as Env["AI"],
    SECURE_API: {
      fetch: vi.fn(async () => new Response(JSON.stringify({ success: true }))),
    } as unknown as Env["SECURE_API"],
    GITHUB_CLIENT_ID: "x",
    GITHUB_CLIENT_SECRET: "x",
    GITHUB_REDIRECT_URI: "x",
    GITHUB_TOKEN_ENCRYPTION_KEY: "x",
    SESSION_SECRET: "x",
    FRONTEND_URL: "x",
    SESSIONS: {
      get: async (key: string) => sessions.get(key) ?? null,
      put: async (key: string, value: string) => {
        sessions.set(key, value);
      },
      delete: async (key: string) => {
        sessions.delete(key);
      },
    } as unknown as Env["SESSIONS"],
    RUN_ENGINE_RUNTIME: runEngineRuntime,
    FEATURE_FLAG_CLOUDFLARE_AGENTS_V1: "false",
  } as Env;
}

async function createSessionToken(
  userId: string,
  secret: string,
): Promise<string> {
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
