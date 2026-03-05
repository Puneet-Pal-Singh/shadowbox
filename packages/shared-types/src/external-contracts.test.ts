import { describe, expect, it } from "vitest";
import {
  EXTERNAL_CONTRACT_FREEZE_VERSION,
  EXTERNAL_CONTRACT_MANIFEST,
  EXTERNAL_EVENT_CONTRACT,
  EXTERNAL_PROVIDER_CONTRACT,
  EXTERNAL_TOOL_CONTRACT,
  validateChatResponseEvent,
} from "./index.js";

describe("external contract freeze", () => {
  it("pins freeze version for coordinated migrations", () => {
    expect(EXTERNAL_CONTRACT_FREEZE_VERSION).toBe(1);
  });

  it("keeps the external contract manifest stable", () => {
    expect(EXTERNAL_CONTRACT_MANIFEST).toMatchInlineSnapshot(`
      {
        "chat": {
          "eventTypes": [
            "text-delta",
            "tool-call",
            "tool-result",
            "tool-error",
            "run-status",
            "final",
          ],
          "payloadFields": {
            "final": [
              "status",
              "totalDurationMs",
              "toolCallCount",
              "failedToolCount",
              "message",
            ],
            "runStatus": [
              "status",
              "reason",
              "taskCount",
              "completedTaskCount",
            ],
            "textDelta": [
              "content",
              "index",
            ],
            "toolCall": [
              "toolId",
              "toolName",
              "arguments",
              "callId",
            ],
            "toolError": [
              "toolId",
              "toolName",
              "callId",
              "error",
              "executionTimeMs",
            ],
            "toolResult": [
              "toolId",
              "toolName",
              "callId",
              "result",
              "executionTimeMs",
            ],
          },
          "protocolVersion": 1,
        },
        "eventEnvelopeFields": [
          "type",
          "runId",
          "timestamp",
          "payload",
        ],
        "provider": {
          "catalogResponseFields": [
            "providers",
            "generatedAt",
          ],
          "connectRequestFields": [
            "providerId",
            "apiKey",
          ],
          "connectResponseFields": [
            "status",
            "providerId",
            "lastValidatedAt",
            "errorMessage",
          ],
          "connectionsResponseFields": [
            "connections",
          ],
          "disconnectRequestFields": [
            "providerId",
          ],
          "disconnectResponseFields": [
            "status",
            "providerId",
          ],
          "discoveryModelsQueryFields": [
            "view",
            "limit",
            "cursor",
          ],
          "discoveryModelsRefreshResponseFields": [
            "providerId",
            "refreshedAt",
            "source",
            "cacheInvalidated",
            "modelsCount",
          ],
          "discoveryModelsResponseFields": [
            "providerId",
            "view",
            "models",
            "page",
            "metadata",
          ],
          "errorEnvelopeFields": [
            "error",
          ],
          "preferencesFields": [
            "defaultProviderId",
            "defaultModelId",
            "updatedAt",
          ],
          "preferencesPatchFields": [
            "defaultProviderId",
            "defaultModelId",
          ],
          "providerIdEnum": [
            "openrouter",
            "openai",
            "groq",
          ],
          "validateRequestFields": [
            "providerId",
            "mode",
          ],
          "validateResponseFields": [
            "providerId",
            "status",
            "checkedAt",
            "validationMode",
          ],
        },
        "version": 1,
      }
    `);
  });

  it("validates provider and tool contract boundary samples", () => {
    const providerConnect = EXTERNAL_PROVIDER_CONTRACT.connectRequestSchema.safeParse(
      {
        providerId: "openai",
        apiKey: "sk-test-FAKE-KEY-DO-NOT-USE",
      },
    );
    expect(providerConnect.success).toBe(true);

    const toolCall = EXTERNAL_TOOL_CONTRACT.toolCallPayloadSchema.safeParse({
      toolId: "tool-1",
      toolName: "readFile",
      arguments: { path: "/tmp/test.txt" },
      callId: "call-1",
    });
    expect(toolCall.success).toBe(true);
  });

  it("rejects invalid event payloads at contract boundary", () => {
    const invalidEvent = {
      type: "tool-result",
      runId: "run-1",
      timestamp: "2026-02-28T00:00:00Z",
      payload: {
        toolId: "tool-1",
        toolName: "readFile",
        callId: "call-1",
        result: "ok",
        executionTimeMs: -1,
      },
    };

    expect(validateChatResponseEvent(invalidEvent)).toBe(false);
    const parsed = EXTERNAL_EVENT_CONTRACT.eventSchema.safeParse(invalidEvent);
    expect(parsed.success).toBe(false);
  });
});
