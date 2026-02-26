import { describe, it, expect } from "vitest";
import {
  CHAT_RESPONSE_EVENT_TYPES,
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

      const event2 = JSON.parse(lines[1]);
      expect(event2.type).toBe(CHAT_RESPONSE_EVENT_TYPES.TEXT_DELTA);
      expect(event2.payload.content).toBe("hello");

      const event3 = JSON.parse(lines[2]);
      expect(event3.type).toBe(CHAT_RESPONSE_EVENT_TYPES.FINAL);
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
      // Create a response with a readable stream
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      // Write data in chunks
      const encoder = new TextEncoder();
      await writer.write(encoder.encode("Hello "));
      await writer.write(encoder.encode("streaming "));
      await writer.write(encoder.encode("world"));
      await writer.close();

      const streamResponse = new Response(readable);
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
