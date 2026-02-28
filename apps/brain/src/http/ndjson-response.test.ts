import { describe, it, expect } from "vitest";
import {
  CHAT_RESPONSE_EVENT_TYPES,
  parseChatResponseEventContract,
  type ChatResponseEventUnion,
} from "@repo/shared-types";
import { ndjsonResponse, textResponseToNdjsonEvents } from "./ndjson-response.js";

describe("NDJSON Response Utilities", () => {
  const mockEnv = {
    CORS_ALLOWED_ORIGINS: "http://localhost:3000",
  } as unknown;

  const mockRequest = new Request("http://localhost:3000/chat", {
    headers: { origin: "http://localhost:3000" },
  });

  describe("ndjsonResponse", () => {
    it("should create response with correct headers", async () => {
      async function* emptyStream(): AsyncIterable<ChatResponseEventUnion> {
        // empty stream
      }

      const response = await ndjsonResponse(
        mockRequest,
        mockEnv as any,
        emptyStream(),
        "run-123",
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "application/x-ndjson; charset=utf-8",
      );
      expect(response.headers.get("X-Run-Id")).toBe("run-123");
      expect(response.headers.get("Transfer-Encoding")).toBe("chunked");
    });

    it("should include CORS headers", async () => {
      async function* emptyStream(): AsyncIterable<ChatResponseEventUnion> {
        // empty stream
      }

      const response = await ndjsonResponse(
        mockRequest,
        mockEnv as any,
        emptyStream(),
        "run-123",
      );

      expect(response.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
    });

    it("should stream events as NDJSON lines", async () => {
      async function* testStream(): AsyncIterable<ChatResponseEventUnion> {
        yield {
          type: CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS,
          runId: "run-123",
          timestamp: "2026-02-26T23:00:00Z",
          payload: { status: "planning" },
        };
        yield {
          type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
          runId: "run-123",
          timestamp: "2026-02-26T23:00:01Z",
          payload: { content: "hello", index: 0 },
        };
        yield {
          type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
          runId: "run-123",
          timestamp: "2026-02-26T23:00:02Z",
          payload: {
            status: "success",
            totalDurationMs: 2000,
            toolCallCount: 0,
            failedToolCount: 0,
          },
        };
      }

      const response = await ndjsonResponse(
        mockRequest,
        mockEnv as any,
        testStream(),
        "run-123",
      );

      expect(response.status).toBe(200);
      expect(response.body).toBeTruthy();

      // Read the stream to verify events are emitted
      const text = await response.text();
      const lines = text.trim().split("\n");

      expect(lines).toHaveLength(3);

      const event1 = JSON.parse(lines[0]);
      expect(event1.type).toBe(CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS);
      expect(() => parseChatResponseEventContract(event1)).not.toThrow();

      const event2 = JSON.parse(lines[1]);
      expect(event2.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA);
      expect(event2.payload.content).toBe("hello");
      expect(() => parseChatResponseEventContract(event2)).not.toThrow();

      const event3 = JSON.parse(lines[2]);
      expect(event3.type).toBe(CHAT_RESPONSE_EVENT_TYPES.FINAL);
      expect(() => parseChatResponseEventContract(event3)).not.toThrow();
    });

    it("should enforce contract validation before streaming", async () => {
      async function* invalidStream(): AsyncIterable<ChatResponseEventUnion> {
        yield {
          type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
          runId: "run-123",
          timestamp: "2026-02-26T23:00:02Z",
          payload: {
            status: "success",
            totalDurationMs: -1, // invalid by contract
            toolCallCount: 0,
            failedToolCount: 0,
          },
        } as unknown as ChatResponseEventUnion;
      }

      const response = await ndjsonResponse(
        mockRequest,
        mockEnv as any,
        invalidStream(),
        "run-123",
      );

      await expect(response.text()).rejects.toThrow();
    });

    it("should snapshot representative contract event sequence", async () => {
      async function* contractSequence(): AsyncIterable<ChatResponseEventUnion> {
        yield {
          type: CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS,
          runId: "run-456",
          timestamp: "2026-02-28T00:00:00Z",
          payload: { status: "planning" },
        };
        yield {
          type: CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA,
          runId: "run-456",
          timestamp: "2026-02-28T00:00:01Z",
          payload: { content: "Planning complete.", index: 0 },
        };
        yield {
          type: CHAT_RESPONSE_EVENT_TYPES.TOOL_CALL,
          runId: "run-456",
          timestamp: "2026-02-28T00:00:02Z",
          payload: {
            toolId: "tool-1",
            toolName: "readFile",
            arguments: { path: "/tmp/input.txt" },
            callId: "call-1",
          },
        };
        yield {
          type: CHAT_RESPONSE_EVENT_TYPES.TOOL_RESULT,
          runId: "run-456",
          timestamp: "2026-02-28T00:00:03Z",
          payload: {
            toolId: "tool-1",
            toolName: "readFile",
            callId: "call-1",
            result: "ok",
            executionTimeMs: 12,
          },
        };
        yield {
          type: CHAT_RESPONSE_EVENT_TYPES.RUN_STATUS,
          runId: "run-456",
          timestamp: "2026-02-28T00:00:04Z",
          payload: { status: "synthesizing" },
        };
        yield {
          type: CHAT_RESPONSE_EVENT_TYPES.FINAL,
          runId: "run-456",
          timestamp: "2026-02-28T00:00:05Z",
          payload: {
            status: "success",
            totalDurationMs: 5000,
            toolCallCount: 1,
            failedToolCount: 0,
          },
        };
      }

      const response = await ndjsonResponse(
        mockRequest,
        mockEnv as any,
        contractSequence(),
        "run-456",
      );

      const lines = (await response.text()).trim().split("\n");
      const events = lines.map((line) =>
        parseChatResponseEventContract(JSON.parse(line)),
      );

      expect(events).toMatchInlineSnapshot(`
        [
          {
            "payload": {
              "status": "planning",
            },
            "runId": "run-456",
            "timestamp": "2026-02-28T00:00:00Z",
            "type": "run-status",
          },
          {
            "payload": {
              "content": "Planning complete.",
              "index": 0,
            },
            "runId": "run-456",
            "timestamp": "2026-02-28T00:00:01Z",
            "type": "text-delta",
          },
          {
            "payload": {
              "arguments": {
                "path": "/tmp/input.txt",
              },
              "callId": "call-1",
              "toolId": "tool-1",
              "toolName": "readFile",
            },
            "runId": "run-456",
            "timestamp": "2026-02-28T00:00:02Z",
            "type": "tool-call",
          },
          {
            "payload": {
              "callId": "call-1",
              "executionTimeMs": 12,
              "result": "ok",
              "toolId": "tool-1",
              "toolName": "readFile",
            },
            "runId": "run-456",
            "timestamp": "2026-02-28T00:00:03Z",
            "type": "tool-result",
          },
          {
            "payload": {
              "status": "synthesizing",
            },
            "runId": "run-456",
            "timestamp": "2026-02-28T00:00:04Z",
            "type": "run-status",
          },
          {
            "payload": {
              "failedToolCount": 0,
              "status": "success",
              "toolCallCount": 1,
              "totalDurationMs": 5000,
            },
            "runId": "run-456",
            "timestamp": "2026-02-28T00:00:05Z",
            "type": "final",
          },
        ]
      `);
    });
  });

  describe("textResponseToNdjsonEvents", () => {
    it("should convert plain text response to text-delta events", async () => {
      const textResponse = new Response("Hello world");
      const events: ChatResponseEventUnion[] = [];

      for await (const event of textResponseToNdjsonEvents(
        textResponse,
        "run-123",
      )) {
        expect(() => parseChatResponseEventContract(event)).not.toThrow();
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.type === CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA))
        .toBe(true);

      // Reconstruct text from events
      const reconstructed = events
        .map((e) => {
          if (e.type === CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA) {
            return e.payload.content;
          }
          return "";
        })
        .join("");

      expect(reconstructed).toBe("Hello world");
    });

    it("should handle streaming response body", async () => {
      const streamResponse = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode("Hello "));
            controller.enqueue(encoder.encode("streaming "));
            controller.enqueue(encoder.encode("world"));
            controller.close();
          },
        }),
      );
      const events: ChatResponseEventUnion[] = [];

      for await (const event of textResponseToNdjsonEvents(
        streamResponse,
        "run-123",
      )) {
        events.push(event);
      }

      const reconstructed = events
        .map((e) => {
          if (e.type === CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA) {
            return e.payload.content;
          }
          return "";
        })
        .join("");

      expect(reconstructed).toBe("Hello streaming world");
    });

    it("should handle empty response body", async () => {
      const emptyResponse = new Response("");
      const events: ChatResponseEventUnion[] = [];

      for await (const event of textResponseToNdjsonEvents(
        emptyResponse,
        "run-123",
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(0);
    });

    it("should set correct event metadata", async () => {
      const textResponse = new Response("test");
      const events: ChatResponseEventUnion[] = [];

      for await (const event of textResponseToNdjsonEvents(
        textResponse,
        "run-456",
      )) {
        events.push(event);
      }

      events.forEach((event) => {
        expect(event.runId).toBe("run-456");
        expect(event.timestamp).toBeTruthy();
        expect(new Date(event.timestamp).getTime()).toBeLessThanOrEqual(
          new Date().getTime(),
        );
      });
    });
  });
});
