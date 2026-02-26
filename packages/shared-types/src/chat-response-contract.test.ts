import { describe, it, expect } from "vitest";
import {
  CHAT_RESPONSE_PROTOCOL_VERSION,
  ChatResponseEventSchema,
  validateChatResponseEvent,
  parseChatResponseEvent,
  safeParseChatResponseEvent,
} from "./chat-response-contract.js";
import { CHAT_RESPONSE_EVENT_TYPES } from "./chat-response-events.js";

describe("Chat Response Contract - Provider Parity Freeze", () => {
  describe("Protocol Version", () => {
    it("should define version 1", () => {
      expect(CHAT_RESPONSE_PROTOCOL_VERSION).toBe(1);
    });
  });

  describe("Event Schema Validation", () => {
    it("should validate text-delta event", () => {
      const event = {
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          content: "hello",
          index: 0,
        },
      };

      expect(validateChatResponseEvent(event)).toBe(true);
    });

    it("should validate tool-call event", () => {
      const event = {
        type: CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          toolId: "tool-1",
          toolName: "readFile",
          arguments: { path: "/test.txt" },
          callId: "call-1",
        },
      };

      expect(validateChatResponseEvent(event)).toBe(true);
    });

    it("should validate tool-result event", () => {
      const event = {
        type: CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          toolId: "tool-1",
          toolName: "readFile",
          callId: "call-1",
          result: "file content",
          executionTimeMs: 50,
        },
      };

      expect(validateChatResponseEvent(event)).toBe(true);
    });

    it("should validate tool-error event", () => {
      const event = {
        type: CHAT_RESPONSE_EVENT_TYPES.TOOL_ERROR,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          toolId: "tool-1",
          toolName: "readFile",
          callId: "call-1",
          error: "File not found",
          executionTimeMs: 10,
        },
      };

      expect(validateChatResponseEvent(event)).toBe(true);
    });

    it("should validate run-status event", () => {
      const event = {
        type: CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          status: "executing",
          reason: "Processing tasks",
          taskCount: 5,
          completedTaskCount: 2,
        },
      };

      expect(validateChatResponseEvent(event)).toBe(true);
    });

    it("should validate final event", () => {
      const event = {
        type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          status: "success",
          totalDurationMs: 5000,
          toolCallCount: 3,
          failedToolCount: 0,
          message: "Completed successfully",
        },
      };

      expect(validateChatResponseEvent(event)).toBe(true);
    });
  });

  describe("Contract Validation Rules", () => {
    it("should reject missing required fields", () => {
      const invalidEvent = {
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        runId: "run-123",
        // missing timestamp
        payload: {
          content: "hello",
          index: 0,
        },
      };

      expect(validateChatResponseEvent(invalidEvent)).toBe(false);
    });

    it("should reject invalid timestamp format", () => {
      const invalidEvent = {
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        runId: "run-123",
        timestamp: "not-a-date",
        payload: {
          content: "hello",
          index: 0,
        },
      };

      expect(validateChatResponseEvent(invalidEvent)).toBe(false);
    });

    it("should reject negative execution time", () => {
      const invalidEvent = {
        type: CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          toolId: "tool-1",
          toolName: "readFile",
          callId: "call-1",
          result: "content",
          executionTimeMs: -10, // invalid
        },
      };

      expect(validateChatResponseEvent(invalidEvent)).toBe(false);
    });

    it("should enforce valid status enum", () => {
      const invalidEvent = {
        type: CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          status: "invalid_status", // not in enum
        },
      };

      expect(validateChatResponseEvent(invalidEvent)).toBe(false);
    });

    it("should enforce final status enum", () => {
      const invalidEvent = {
        type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          status: "running", // only success/failed allowed
          totalDurationMs: 1000,
          toolCallCount: 0,
          failedToolCount: 0,
        },
      };

      expect(validateChatResponseEvent(invalidEvent)).toBe(false);
    });
  });

  describe("Parse Functions", () => {
    it("should parse valid event", () => {
      const event = {
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          content: "test",
          index: 0,
        },
      };

      const parsed = parseChatResponseEvent(event);
      expect(parsed.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA);
    });

    it("should throw on invalid event", () => {
      const invalidEvent = {
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        // missing required fields
        payload: {},
      };

      expect(() => parseChatResponseEvent(invalidEvent)).toThrow();
    });

    it("should safely parse with error details", () => {
      const validEvent = {
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          content: "test",
          index: 0,
        },
      };

      const result = safeParseChatResponseEvent(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA);
      }
    });

    it("should return error on invalid event", () => {
      const invalidEvent = {
        type: "invalid",
        payload: {},
      };

      const result = safeParseChatResponseEvent(invalidEvent);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });
  });

  describe("Cross-Provider Parity", () => {
    it("should enforce consistent text-delta schema", () => {
      // Events from any provider should validate the same way
      const openaiEvent = {
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        runId: "run-openai",
        timestamp: "2026-02-26T23:00:00Z",
        payload: { content: "openai response", index: 0 },
      };

      const anthropicEvent = {
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        runId: "run-anthropic",
        timestamp: "2026-02-26T23:00:00Z",
        payload: { content: "anthropic response", index: 0 },
      };

      const groqEvent = {
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        runId: "run-groq",
        timestamp: "2026-02-26T23:00:00Z",
        payload: { content: "groq response", index: 0 },
      };

      expect(validateChatResponseEvent(openaiEvent)).toBe(true);
      expect(validateChatResponseEvent(anthropicEvent)).toBe(true);
      expect(validateChatResponseEvent(groqEvent)).toBe(true);
    });

    it("should enforce consistent tool-call schema across providers", () => {
      // All providers must emit tool-calls with same schema
      const toolCall = {
        type: CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL,
        runId: "run-1",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          toolId: "tool-1",
          toolName: "readFile",
          arguments: { path: "/test.txt" },
          callId: "call-1",
        },
      };

      expect(validateChatResponseEvent(toolCall)).toBe(true);
    });

    it("should enforce consistent final event across providers", () => {
      const finalEvents = [
        {
          type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
          runId: "run-openai",
          timestamp: "2026-02-26T23:00:00Z",
          payload: {
            status: "success" as const,
            totalDurationMs: 1000,
            toolCallCount: 1,
            failedToolCount: 0,
          },
        },
        {
          type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
          runId: "run-anthropic",
          timestamp: "2026-02-26T23:00:00Z",
          payload: {
            status: "success" as const,
            totalDurationMs: 1500,
            toolCallCount: 2,
            failedToolCount: 0,
          },
        },
      ];

      finalEvents.forEach((event) => {
        expect(validateChatResponseEvent(event)).toBe(true);
      });
    });
  });

  describe("Optional Fields", () => {
    it("should allow optional reason in run-status", () => {
      const eventWithoutReason = {
        type: CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          status: "completed" as const,
        },
      };

      expect(validateChatResponseEvent(eventWithoutReason)).toBe(true);
    });

    it("should allow optional message in final", () => {
      const eventWithoutMessage = {
        type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
        runId: "run-123",
        timestamp: "2026-02-26T23:00:00Z",
        payload: {
          status: "success" as const,
          totalDurationMs: 1000,
          toolCallCount: 0,
          failedToolCount: 0,
        },
      };

      expect(validateChatResponseEvent(eventWithoutMessage)).toBe(true);
    });
  });
});
