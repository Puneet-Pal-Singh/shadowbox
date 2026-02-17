import { describe, expect, it, vi } from "vitest";
vi.mock("./core/AgentRuntime", () => ({
  AgentRuntime: class AgentRuntime {},
}));
vi.mock("@cloudflare/sandbox", () => ({
  Sandbox: class Sandbox {},
}));

import worker, { type Env } from "./index";

describe("secure-agent-api chat history routing", () => {
  it("serves canonical history route from runId path segment", async () => {
    const runtimeStub = createRuntimeStub();
    const env = createEnv(runtimeStub);
    const request = new Request(
      "https://secure.local/api/chat/history/run%2F123?cursor=cursor-1&limit=25",
      { method: "GET" },
    );

    const response = await worker.fetch(request, env);
    const body = (await response.json()) as {
      messages: Array<{ role: string; content: string }>;
      nextCursor: string | null;
    };

    expect(response.status).toBe(200);
    expect(runtimeStub.getHistory).toHaveBeenCalledWith("run/123", "cursor-1", 25);
    expect(body.messages).toHaveLength(1);
  });

  it("keeps legacy /chat route behavior compatible", async () => {
    const runtimeStub = createRuntimeStub();
    const env = createEnv(runtimeStub);
    const request = new Request(
      "https://secure.local/chat?runId=run-legacy&cursor=cursor-2&limit=10",
      { method: "GET" },
    );

    const response = await worker.fetch(request, env);
    const body = (await response.json()) as {
      messages: Array<{ role: string; content: string }>;
      nextCursor: string | null;
    };

    expect(response.status).toBe(200);
    expect(runtimeStub.getHistory).toHaveBeenCalledWith(
      "run-legacy",
      "cursor-2",
      10,
    );
    expect(body.messages[0]?.content).toBe("hello");
  });
});

function createRuntimeStub() {
  return {
    getHistory: vi.fn(async () => ({
      messages: [{ role: "assistant", content: "hello" }],
      nextCursor: null,
      hasMore: false,
    })),
  };
}

function createEnv(runtimeStub: { getHistory: unknown }): Env {
  const namespace = {
    idFromName: vi.fn(() => ({ toString: () => "stub-id" })),
    get: vi.fn(() => runtimeStub),
  };

  return {
    AGENT_RUNTIME: namespace as unknown as Env["AGENT_RUNTIME"],
    Sandbox: {} as Env["Sandbox"],
    ARTIFACTS: {} as Env["ARTIFACTS"],
  };
}
