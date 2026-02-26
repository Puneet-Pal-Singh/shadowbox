import { describe, it, expect, beforeEach } from "vitest";
import {
  CHAT_RESPONSE_EVENT_TYPES,
  isChatResponseEventOfType,
} from "@repo/shared-types";
import { EventStreamService } from "./EventStreamService.js";

describe("EventStreamService", () => {
  let service: EventStreamService;
  const testRunId = "run-test-123";

  beforeEach(() => {
    service = new EventStreamService({ runId: testRunId });
  });

  describe("Configuration", () => {
    it("should initialize with default enableEventStream=true", () => {
      expect(service.isEnabled()).toBe(true);
    });

    it("should respect enableEventStream=false", () => {
      const disabledService = new EventStreamService({
        runId: testRunId,
        enableEventStream: false,
      });
      expect(disabledService.isEnabled()).toBe(false);
    });
  });

  describe("Text Delta Events", () => {
    it("should generate text-delta event with incremented index", () => {
      const event1 = service.textDelta("hello");
      const event2 = service.textDelta(" world");

      expect(event1.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA);
      expect(event1.payload.content).toBe("hello");
      expect(event1.payload.index).toBe(0);

      expect(event2.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA);
      expect(event2.payload.content).toBe(" world");
      expect(event2.payload.index).toBe(1);
    });

    it("should set runId and timestamp on text-delta", () => {
      const event = service.textDelta("test");

      expect(event.runId).toBe(testRunId);
      expect(event.timestamp).toBeTruthy();
      expect(new Date(event.timestamp).getTime()).toBeLessThanOrEqual(
        new Date().getTime(),
      );
    });
  });

  describe("Tool Call Events", () => {
    it("should generate tool-call event", () => {
      const event = service.toolCall(
        "tool-1",
        "readFile",
        { path: "/test.txt" },
        "call-1",
      );

      expect(event.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL);
      expect(event.payload.toolId).toBe("tool-1");
      expect(event.payload.toolName).toBe("readFile");
      expect(event.payload.callId).toBe("call-1");
      expect(event.payload.arguments.path).toBe("/test.txt");
    });

    it("should increment tool call count", () => {
      service.toolCall("tool-1", "readFile", {}, "call-1");
      service.toolCall("tool-2", "writeFile", {}, "call-2");

      const finalEvent = service.final("success", 1000);
      expect(finalEvent.payload.toolCallCount).toBe(2);
    });
  });

  describe("Tool Result Events", () => {
    it("should generate tool-result event", () => {
      const event = service.toolResult(
        "tool-1",
        "readFile",
        "call-1",
        "file content",
        50,
      );

      expect(event.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT);
      expect(event.payload.toolId).toBe("tool-1");
      expect(event.payload.toolName).toBe("readFile");
      expect(event.payload.callId).toBe("call-1");
      expect(event.payload.result).toBe("file content");
      expect(event.payload.executionTimeMs).toBe(50);
    });

    it("should handle complex result objects", () => {
      const complexResult = {
        data: [1, 2, 3],
        meta: { total: 3 },
      };

      const event = service.toolResult(
        "tool-1",
        "analyzeData",
        "call-1",
        complexResult,
        100,
      );

      expect(event.payload.result).toEqual(complexResult);
    });
  });

  describe("Tool Error Events", () => {
    it("should generate tool-error event and increment failed count", () => {
      const event = service.toolError(
        "tool-1",
        "readFile",
        "call-1",
        "File not found",
        10,
      );

      expect(event.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TOOL_ERROR);
      expect(event.payload.toolId).toBe("tool-1");
      expect(event.payload.toolName).toBe("readFile");
      expect(event.payload.callId).toBe("call-1");
      expect(event.payload.error).toBe("File not found");
      expect(event.payload.executionTimeMs).toBe(10);
    });

    it("should track failed tool count", () => {
      service.toolCall("tool-1", "readFile", {}, "call-1");
      service.toolError("tool-1", "readFile", "call-1", "Error", 10);
      service.toolCall("tool-2", "writeFile", {}, "call-2");
      service.toolError("tool-2", "writeFile", "call-2", "Error", 15);

      const finalEvent = service.final("success", 1000);
      expect(finalEvent.payload.toolCallCount).toBe(2);
      expect(finalEvent.payload.failedToolCount).toBe(2);
    });
  });

  describe("Run Status Events", () => {
    it("should generate run-status event for planning phase", () => {
      const event = service.runStatus("planning");

      expect(event.type).toBe(CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS);
      expect(event.payload.status).toBe("planning");
    });

    it("should generate run-status event with task progress", () => {
      const event = service.runStatus("executing", undefined, 5, 2);

      expect(event.type).toBe(CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS);
      expect(event.payload.status).toBe("executing");
      expect(event.payload.taskCount).toBe(5);
      expect(event.payload.completedTaskCount).toBe(2);
    });

    it("should generate run-status event with reason", () => {
      const event = service.runStatus("failed", "Budget exceeded");

      expect(event.payload.status).toBe("failed");
      expect(event.payload.reason).toBe("Budget exceeded");
    });
  });

  describe("Final Events", () => {
    it("should generate final success event", () => {
      const event = service.final("success", 5000);

      expect(event.type).toBe(CHAT_RESPONSE_EVENT_TYPES.FINAL);
      expect(event.payload.status).toBe("success");
      expect(event.payload.totalDurationMs).toBe(5000);
    });

    it("should generate final failed event with message", () => {
      const event = service.final(
        "failed",
        3000,
        "One tool failed, check errors above",
      );

      expect(event.payload.status).toBe("failed");
      expect(event.payload.totalDurationMs).toBe(3000);
      expect(event.payload.message).toBe(
        "One tool failed, check errors above",
      );
    });

    it("should aggregate tool statistics in final event", () => {
      service.toolCall("tool-1", "fn1", {}, "call-1");
      service.toolResult("tool-1", "fn1", "call-1", "result", 100);
      service.toolCall("tool-2", "fn2", {}, "call-2");
      service.toolError("tool-2", "fn2", "call-2", "error", 50);
      service.toolCall("tool-3", "fn3", {}, "call-3");
      service.toolResult("tool-3", "fn3", "call-3", "result", 75);

      const event = service.final("success", 2000);

      expect(event.payload.toolCallCount).toBe(3);
      expect(event.payload.failedToolCount).toBe(1);
    });
  });

  describe("Event Sequence", () => {
    it("should generate valid event sequence for conversational response", () => {
      const runStatusEvent = service.runStatus("executing");
      const textDelta1 = service.textDelta("Hello");
      const textDelta2 = service.textDelta(", world!");
      const finalEvent = service.final("success", 500);

      expect(runStatusEvent.type).toBe(CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS);
      expect(textDelta1.payload.index).toBe(0);
      expect(textDelta2.payload.index).toBe(1);
      expect(finalEvent.payload.toolCallCount).toBe(0);
    });

    it("should generate valid event sequence with tool execution", () => {
      const planning = service.runStatus("planning");
      const toolCall = service.toolCall(
        "tool-1",
        "readFile",
        { path: "/test.txt" },
        "call-1",
      );
      const executing = service.runStatus("executing", undefined, 1, 0);
      const toolResult = service.toolResult(
        "tool-1",
        "readFile",
        "call-1",
        "content",
        100,
      );
      const synthesizing = service.runStatus("synthesizing");
      const synthesis = service.textDelta("Processed content...");
      const final = service.final("success", 5000);

      expect(planning.payload.status).toBe("planning");
      expect(
        isChatResponseEventOfType(toolCall, CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL),
      ).toBe(true);
      expect(executing.payload.completedTaskCount).toBe(0);
      expect(
        isChatResponseEventOfType(
          toolResult,
          CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT,
        ),
      ).toBe(true);
      expect(synthesizing.payload.status).toBe("synthesizing");
      expect(synthesis.payload.content).toBe("Processed content...");
      expect(final.payload.status).toBe("success");
    });
  });

  describe("Reset", () => {
    it("should reset event counters", () => {
      service.textDelta("hello");
      service.toolCall("tool-1", "fn", {}, "call-1");
      service.toolError("tool-1", "fn", "call-1", "error", 10);

      let finalEvent = service.final("success", 1000);
      expect(finalEvent.payload.textDeltaIndex).toBeUndefined(); // textDeltaIndex not exposed in final
      expect(finalEvent.payload.toolCallCount).toBe(1);
      expect(finalEvent.payload.failedToolCount).toBe(1);

      service.reset();

      const newDelta = service.textDelta("world");
      const newFinal = service.final("success", 1000);

      expect(newDelta.payload.index).toBe(0);
      expect(newFinal.payload.toolCallCount).toBe(0);
      expect(newFinal.payload.failedToolCount).toBe(0);
    });
  });
});
