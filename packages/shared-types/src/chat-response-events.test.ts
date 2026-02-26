import { describe, it, expect } from "vitest";
import {
  CHAT_RESPONSE_EVENT_TYPES,
  type ChatResponseEventUnion,
  isChatResponseEvent,
  isChatResponseEventOfType,
  serializeChatResponseEvent,
  parseChatResponseEvent,
} from "./chat-response-events.js";

describe("ChatResponseEvents", () => {
  describe("Event Type Constants", () => {
    it("should define all required event types", () => {
      expect(CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA).toBe("text-delta");
      expect(CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL).toBe("tool-call");
      expect(CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT).toBe("tool-result");
      expect(CHAT_RESPONSE_EVENT_TYPES.TOOL_ERROR).toBe("tool-error");
      expect(CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS).toBe("run-status");
      expect(CHAT_RESPONSE_EVENT_TYPES.FINAL).toBe("final");
    });
  });

  describe("Type Guards", () => {
    it("should identify valid text-delta events", () => {
      const event: ChatResponseEventUnion = {
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        runId: "run-1",
        timestamp: new Date().toISOString(),
        payload: { content: "hello", index: 0 },
      };

      expect(isChatResponseEvent(event)).toBe(true);
      expect(
        isChatResponseEventOfType(event, CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA),
      ).toBe(true);
    });

    it("should identify valid tool-call events", () => {
      const event: ChatResponseEventUnion = {
        type: CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL,
        runId: "run-1",
        timestamp: new Date().toISOString(),
        payload: {
          toolId: "tool-1",
          toolName: "readFile",
          arguments: { path: "/test.txt" },
          callId: "call-1",
        },
      };

      expect(isChatResponseEvent(event)).toBe(true);
      expect(
        isChatResponseEventOfType(event, CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL),
      ).toBe(true);
    });

    it("should identify valid tool-result events", () => {
      const event: ChatResponseEventUnion = {
        type: CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT,
        runId: "run-1",
        timestamp: new Date().toISOString(),
        payload: {
          toolId: "tool-1",
          toolName: "readFile",
          callId: "call-1",
          result: "file content",
          executionTimeMs: 50,
        },
      };

      expect(isChatResponseEvent(event)).toBe(true);
      expect(
        isChatResponseEventOfType(event, CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT),
      ).toBe(true);
    });

    it("should identify valid tool-error events", () => {
      const event: ChatResponseEventUnion = {
        type: CHAT_RESPONSE_EVENT_TYPES.TOOL_ERROR,
        runId: "run-1",
        timestamp: new Date().toISOString(),
        payload: {
          toolId: "tool-1",
          toolName: "readFile",
          callId: "call-1",
          error: "File not found",
          executionTimeMs: 10,
        },
      };

      expect(isChatResponseEvent(event)).toBe(true);
      expect(
        isChatResponseEventOfType(event, CHAT_RESPONSE_EVENT_TYPES.TOOL_ERROR),
      ).toBe(true);
    });

    it("should identify valid run-status events", () => {
      const event: ChatResponseEventUnion = {
        type: CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS,
        runId: "run-1",
        timestamp: new Date().toISOString(),
        payload: {
          status: "executing",
          reason: "Running tasks",
          taskCount: 5,
          completedTaskCount: 2,
        },
      };

      expect(isChatResponseEvent(event)).toBe(true);
      expect(
        isChatResponseEventOfType(event, CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS),
      ).toBe(true);
    });

    it("should identify valid final events", () => {
      const event: ChatResponseEventUnion = {
        type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
        runId: "run-1",
        timestamp: new Date().toISOString(),
        payload: {
          status: "success",
          totalDurationMs: 5000,
          toolCallCount: 3,
          failedToolCount: 0,
        },
      };

      expect(isChatResponseEvent(event)).toBe(true);
      expect(
        isChatResponseEventOfType(event, CHAT_RESPONSE_EVENT_TYPES.FINAL),
      ).toBe(true);
    });

    it("should reject invalid events", () => {
      expect(isChatResponseEvent(null)).toBe(false);
      expect(isChatResponseEvent({})).toBe(false);
      expect(isChatResponseEvent({ type: "invalid" })).toBe(false);
      expect(isChatResponseEvent("not an object")).toBe(false);
    });
  });

  describe("Serialization/Deserialization", () => {
    it("should serialize text-delta event to NDJSON", () => {
      const event: ChatResponseEventUnion = {
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        runId: "run-1",
        timestamp: "2026-02-26T22:30:00Z",
        payload: { content: "hello world", index: 0 },
      };

      const serialized = serializeChatResponseEvent(event);
      const parsed = JSON.parse(serialized) as Record<string, unknown>;

      expect(parsed.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA);
      const payload = parsed.payload as Record<string, unknown>;
      expect(payload.content).toBe("hello world");
    });

    it("should parse NDJSON line to event", () => {
      const line = JSON.stringify({
        type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
        runId: "run-1",
        timestamp: "2026-02-26T22:30:00Z",
        payload: { content: "parsed", index: 0 },
      });

      const event = parseChatResponseEvent(line);

      expect(event.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA);
      if (isChatResponseEventOfType(event, CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA)) {
        expect(event.payload.content).toBe("parsed");
      }
    });

    it("should handle NDJSON stream (multiple events)", () => {
      const events: ChatResponseEventUnion[] = [
        {
          type: CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS,
          runId: "run-1",
          timestamp: "2026-02-26T22:30:00Z",
          payload: { status: "planning" },
        },
        {
          type: CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL,
          runId: "run-1",
          timestamp: "2026-02-26T22:30:01Z",
          payload: {
            toolId: "tool-1",
            toolName: "readFile",
            arguments: { path: "/test.txt" },
            callId: "call-1",
          },
        },
        {
          type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
          runId: "run-1",
          timestamp: "2026-02-26T22:30:02Z",
          payload: { content: "done", index: 0 },
        },
        {
          type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
          runId: "run-1",
          timestamp: "2026-02-26T22:30:03Z",
          payload: {
            status: "success",
            totalDurationMs: 3000,
            toolCallCount: 1,
            failedToolCount: 0,
          },
        },
      ];

      // Serialize as NDJSON
      const ndjsonStream = events.map(serializeChatResponseEvent).join("\n");
      const lines = ndjsonStream.split("\n");

      // Deserialize back
      const parsedEvents = lines.map(parseChatResponseEvent);

      expect(parsedEvents).toHaveLength(4);
      expect(parsedEvents.at(0)?.type).toBe(CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS);
      expect(parsedEvents.at(1)?.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL);
      expect(parsedEvents.at(2)?.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA);
      expect(parsedEvents.at(3)?.type).toBe(CHAT_RESPONSE_EVENT_TYPES.FINAL);
    });

    it("should throw on invalid NDJSON line", () => {
      const invalidLine = JSON.stringify({ type: "invalid-type" });
      expect(() => parseChatResponseEvent(invalidLine)).toThrow();
    });
  });

  describe("Event Payload Validation", () => {
    it("should handle tool-result with complex result data", () => {
      const event: ChatResponseEventUnion = {
        type: CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT,
        runId: "run-1",
        timestamp: new Date().toISOString(),
        payload: {
          toolId: "tool-1",
          toolName: "analyzeCode",
          callId: "call-1",
          result: {
            issues: [
              { line: 10, severity: "error", message: "Unused variable" },
            ],
            summary: "1 issue found",
          },
          executionTimeMs: 100,
        },
      };

      expect(isChatResponseEvent(event)).toBe(true);
    });

    it("should handle run-status without optional fields", () => {
      const event: ChatResponseEventUnion = {
        type: CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS,
        runId: "run-1",
        timestamp: new Date().toISOString(),
        payload: {
          status: "completed",
        },
      };

      expect(isChatResponseEvent(event)).toBe(true);
    });

    it("should handle final event with all fields", () => {
      const event: ChatResponseEventUnion = {
        type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
        runId: "run-1",
        timestamp: new Date().toISOString(),
        payload: {
          status: "failed",
          totalDurationMs: 1500,
          toolCallCount: 2,
          failedToolCount: 1,
          message: "One tool failed, see errors above",
        },
      };

      expect(isChatResponseEvent(event)).toBe(true);
    });
  });
});
