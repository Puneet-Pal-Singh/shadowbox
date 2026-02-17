import { describe, expect, it, vi } from "vitest";
import { ChatController } from "./ChatController";
import type { Env } from "../types/ai";

const VALID_RUN_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("ChatController DO runtime migration", () => {
  it("routes execution through RUN_ENGINE_RUNTIME and tags response headers", async () => {
    const runtime = createMockRuntimeNamespace();
    const env = createEnv(runtime.namespace);

    const response = await ChatController.handle(createChatRequest(), env);

    expect(response.status).toBe(200);
    expect(runtime.idFromName).toHaveBeenCalledWith(VALID_RUN_ID);
    expect(runtime.get).toHaveBeenCalledTimes(1);
    expect(runtime.fetch).toHaveBeenCalledTimes(1);
    expect(response.headers.get("X-Run-Engine-Runtime")).toBe("do");
  });

  it("fails fast when RUN_ENGINE_RUNTIME binding is unavailable", async () => {
    const envWithRuntime = createEnv(createMockRuntimeNamespace().namespace);
    const envWithoutRuntime = envWithRuntime as unknown as Record<
      string,
      unknown
    >;
    delete envWithoutRuntime.RUN_ENGINE_RUNTIME;

    const response = await ChatController.handle(
      createChatRequest(),
      envWithoutRuntime as unknown as Env,
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("RUN_ENGINE_RUNTIME binding is unavailable");
  });

  it("forwards provider/model override fields to runtime payload", async () => {
    const runtime = createMockRuntimeNamespace();
    const env = createEnv(runtime.namespace);
    const requestWithProviderModel = new Request(
      "https://brain.local/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          runId: VALID_RUN_ID,
          providerId: "openai",
          modelId: "gpt-4",
          messages: [
            {
              role: "user",
              content: "hello",
            },
          ],
        }),
      }
    );

    const response = await ChatController.handle(requestWithProviderModel, env);

    expect(response.status).toBe(200);
    const fetchCall = runtime.fetch.mock.calls[0];
    expect(fetchCall).toBeDefined();

    // Verify the payload sent to runtime includes provider/model
    const payloadStr = (fetchCall[1] as { body: string }).body;
    const payload = JSON.parse(payloadStr);
    expect(payload.input.providerId).toBe("openai");
    expect(payload.input.modelId).toBe("gpt-4");
  });
});

function createChatRequest(): Request {
  return new Request("https://brain.local/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  return { namespace, idFromName, get, fetch };
}

function createEnv(runEngineRuntime: Env["RUN_ENGINE_RUNTIME"]): Env {
  return {
    AI: {} as Env["AI"],
    SECURE_API: {} as Env["SECURE_API"],
    GITHUB_CLIENT_ID: "x",
    GITHUB_CLIENT_SECRET: "x",
    GITHUB_REDIRECT_URI: "x",
    GITHUB_TOKEN_ENCRYPTION_KEY: "x",
    SESSION_SECRET: "x",
    FRONTEND_URL: "x",
    SESSIONS: {} as Env["SESSIONS"],
    RUN_ENGINE_RUNTIME: runEngineRuntime,
  };
}
