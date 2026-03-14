import { describe, expect, it, vi } from "vitest";
import { GitController } from "./GitController";
import type { Env } from "../types/ai";

describe("GitController", () => {
  it("fails fast when MUSCLE_BASE_URL is not configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await GitController.getStatus(
      new Request("https://brain.local/api/git/status?runId=run-123"),
      createEnv(),
    );

    expect(response.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();

    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("MUSCLE_BASE_URL is required");
    fetchSpy.mockRestore();
  });
});

function createEnv(): Env {
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
    FRONTEND_URL: "http://localhost:5173",
    RUNTIME_GIT_SHA: "test-sha",
    SESSIONS: {
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    } as unknown as Env["SESSIONS"],
    RUN_ENGINE_RUNTIME: {
      idFromName: vi.fn(),
      get: vi.fn(),
    } as unknown as Env["RUN_ENGINE_RUNTIME"],
  };
}
