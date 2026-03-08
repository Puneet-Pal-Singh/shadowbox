/**
 * Adapter Integration Tests
 *
 * Verifies that Cloudflare adapters implement port contracts correctly.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CloudflareEventStreamAdapter } from "./CloudflareEventStreamAdapter";
import type { StreamEvent } from "../ports";

describe("Runtime Adapters", () => {
  describe("CloudflareEventStreamAdapter", () => {
    let adapter: CloudflareEventStreamAdapter;

    beforeEach(() => {
      adapter = new CloudflareEventStreamAdapter();
    });

    it("should implement RealtimeEventPort interface", () => {
      expect(adapter.emit).toBeDefined();
      expect(adapter.emitBatch).toBeDefined();
      expect(adapter.complete).toBeDefined();
      expect(adapter.error).toBeDefined();
      expect(adapter.getStream).toBeDefined();
    });

    it("should emit single events", () => {
      const event: StreamEvent = {
        type: "text-delta",
        runId: "test-run",
        timestamp: Date.now(),
        data: { delta: "hello" },
      };

      expect(() => adapter.emit(event)).not.toThrow();
    });

    it("should emit batches of events", () => {
      const events: StreamEvent[] = [
        {
          type: "text-delta",
          runId: "test-run",
          timestamp: Date.now(),
          data: { delta: "hello" },
        },
        {
          type: "text-delta",
          runId: "test-run",
          timestamp: Date.now(),
          data: { delta: " world" },
        },
      ];

      expect(() => adapter.emitBatch(events)).not.toThrow();
    });

    it("should complete streams", () => {
      expect(() => adapter.complete("test-run")).not.toThrow();
    });

    it("should emit errors and complete", () => {
      expect(() => {
        adapter.error("test-run", {
          code: "TEST_ERROR",
          message: "Test error message",
        });
      }).not.toThrow();
    });

    it("should get stream for run", () => {
      const stream = adapter.getStream("test-run");
      expect(stream).toBeDefined();
      expect(stream instanceof ReadableStream).toBe(true);
    });

    it("should ignore events for completed runs", () => {
      const event: StreamEvent = {
        type: "text-delta",
        runId: "test-run",
        timestamp: Date.now(),
        data: { delta: "hello" },
      };

      adapter.complete("test-run");

      // Should warn and return early, not throw
      expect(() => adapter.emit(event)).not.toThrow();
    });

    it("should stream NDJSON envelopes in emitted order", async () => {
      const runId = "test-run-stream-order";
      const stream = adapter.getStream(runId);

      adapter.emit({
        type: "text-delta",
        runId,
        timestamp: 1000,
        data: { delta: "hello" },
      });
      adapter.emit({
        type: "tool-call",
        runId,
        timestamp: 1001,
        data: { tool: "read_file" },
      });
      adapter.complete(runId);

      const events = await readStreamEvents(stream);
      expect(events.map((event) => event.type)).toEqual([
        "text-delta",
        "tool-call",
      ]);
      expect(events.every((event) => event.runId === runId)).toBe(true);
    });

    it("should keep streams isolated per runId", async () => {
      const streamA = adapter.getStream("run-a");
      const streamB = adapter.getStream("run-b");

      adapter.emit({
        type: "text-delta",
        runId: "run-a",
        timestamp: 1,
        data: { delta: "A" },
      });
      adapter.emit({
        type: "text-delta",
        runId: "run-b",
        timestamp: 2,
        data: { delta: "B" },
      });
      adapter.complete("run-a");
      adapter.complete("run-b");

      const [eventsA, eventsB] = await Promise.all([
        readStreamEvents(streamA),
        readStreamEvents(streamB),
      ]);
      expect(eventsA).toHaveLength(1);
      expect(eventsB).toHaveLength(1);
      expect(eventsA[0]?.runId).toBe("run-a");
      expect(eventsB[0]?.runId).toBe("run-b");
    });
  });

  describe("Adapter Substitutability", () => {
    it("should allow adapter implementations to be swapped", () => {
      const adapter1 = new CloudflareEventStreamAdapter();
      const adapter2 = new CloudflareEventStreamAdapter();

      // Both should satisfy the same interface
      const event: StreamEvent = {
        type: "text-delta",
        runId: "test",
        timestamp: Date.now(),
        data: {},
      };

      adapter1.emit(event);
      adapter2.emit(event);

      expect(adapter1.getStream("test")).toBeDefined();
      expect(adapter2.getStream("test")).toBeDefined();
    });
  });
});

async function readStreamEvents(stream: ReadableStream<Uint8Array>): Promise<StreamEvent[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
  }

  return buffer
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as StreamEvent);
}
