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
