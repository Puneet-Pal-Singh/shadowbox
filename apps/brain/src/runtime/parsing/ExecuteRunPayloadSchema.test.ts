import { describe, expect, it } from "vitest";
import { ExecuteRunPayloadSchema } from "./ExecuteRunPayloadSchema";

function createValidPayload() {
  return {
    runId: "run-1",
    sessionId: "session-1",
    correlationId: "corr-1",
    input: {
      mode: "build" as const,
      agentType: "coding" as const,
      prompt: "inspect repository",
      sessionId: "session-1",
      orchestratorBackend: "execution-engine-v1" as const,
      executionBackend: "cloudflare_sandbox" as const,
      harnessMode: "platform_owned" as const,
      authMode: "api_key" as const,
    },
    messages: [{ role: "user", content: "inspect repository" }],
  };
}

describe("ExecuteRunPayloadSchema tools validation", () => {
  it("rejects primitive tool schema values in inputSchema/parameters", () => {
    const payload = createValidPayload();
    payload.tools = {
      bash: {
        description: "Run shell command",
        inputSchema: "not-an-object",
        parameters: 42,
      },
    };

    const result = ExecuteRunPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("applies default empty parameters object when omitted", () => {
    const payload = createValidPayload();
    payload.tools = {
      bash: {
        description: "Run shell command",
        inputSchema: { type: "object" },
      },
    };

    const result = ExecuteRunPayloadSchema.parse(payload);
    expect(result.tools?.bash?.parameters).toEqual({});
  });

  it("accepts object parameters for tool definitions", () => {
    const payload = createValidPayload();
    payload.tools = {
      bash: {
        description: "Run shell command",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" },
          },
        },
      },
    };

    const result = ExecuteRunPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("keeps validated input.metadata feature flags", () => {
    const payload = createValidPayload();
    payload.input.metadata = {
      featureFlags: {
        agenticLoopV1: true,
        reviewerPassV1: false,
      },
    };

    const result = ExecuteRunPayloadSchema.parse(payload);
    expect(result.input.metadata?.featureFlags?.agenticLoopV1).toBe(true);
    expect(result.input.metadata?.featureFlags?.reviewerPassV1).toBe(false);
  });

  it("accepts explicit plan mode", () => {
    const payload = createValidPayload();
    payload.input.mode = "plan";

    const result = ExecuteRunPayloadSchema.parse(payload);
    expect(result.input.mode).toBe("plan");
  });
});
