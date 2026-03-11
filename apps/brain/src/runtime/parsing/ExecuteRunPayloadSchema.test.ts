import { describe, expect, it } from "vitest";
import { ExecuteRunPayloadSchema } from "./ExecuteRunPayloadSchema";

function createValidPayload() {
  return {
    runId: "run-1",
    sessionId: "session-1",
    correlationId: "corr-1",
    input: {
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
      run_command: {
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
      run_command: {
        description: "Run shell command",
        inputSchema: { type: "object" },
      },
    };

    const result = ExecuteRunPayloadSchema.parse(payload);
    expect(result.tools?.run_command?.parameters).toEqual({});
  });

  it("accepts object parameters for tool definitions", () => {
    const payload = createValidPayload();
    payload.tools = {
      run_command: {
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
});
