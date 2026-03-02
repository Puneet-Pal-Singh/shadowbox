/**
 * CloudflareEventStreamAdapter - Cloudflare implementation of RealtimeEventPort.
 *
 * Manages streaming events to clients via NDJSON format.
 * Bridges Cloudflare Workers streaming to port contracts.
 */

import type { StreamEvent, RealtimeEventPort } from "../ports";

/**
 * Cloudflare Workers-backed implementation of event streaming.
 *
 * Owns:
 * - Event serialization and buffering
 * - NDJSON format generation
 * - Stream lifecycle and backpressure handling
 */
export class CloudflareEventStreamAdapter implements RealtimeEventPort {
  private events: Map<string, StreamEvent[]> = new Map();
  private controller: Map<string, ReadableStreamDefaultController<Uint8Array>> =
    new Map();
  private completed: Set<string> = new Set();

  emit(event: StreamEvent): void {
    if (this.completed.has(event.runId)) {
      console.warn(`[event-stream] Ignoring event for completed run: ${event.runId}`);
      return;
    }

    const key = event.runId;
    if (!this.events.has(key)) {
      this.events.set(key, []);
    }

    this.events.get(key)!.push(event);
    this.flushToStream(key);
  }

  emitBatch(events: StreamEvent[]): void {
    for (const event of events) {
      this.emit(event);
    }
  }

  complete(runId: string): void {
    this.completed.add(runId);
    const controller = this.controller.get(runId);
    if (controller) {
      controller.close();
    }
  }

  error(
    runId: string,
    error: {
      code: string;
      message: string;
      details?: unknown;
    },
  ): void {
    const errorEvent: StreamEvent = {
      type: "error",
      runId,
      timestamp: Date.now(),
      data: error,
    };

    this.emit(errorEvent);
    this.complete(runId);
  }

  getStream(runId: string): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start: (controller: ReadableStreamDefaultController<Uint8Array>) => {
        this.controller.set(runId, controller);
        // Flush any pending events
        this.flushToStream(runId);
      },
      cancel: () => {
        // Clean up on cancel
        this.controller.delete(runId);
      },
    });
  }

  private flushToStream(runId: string): void {
    const controller = this.controller.get(runId);
    if (!controller) {
      return; // Controller not yet registered
    }

    const events = this.events.get(runId) || [];
    while (events.length > 0) {
      const event = events.shift()!;
      const serialized = JSON.stringify(event) + "\n";
      const uint8 = new TextEncoder().encode(serialized);

      try {
        controller.enqueue(uint8);
      } catch (e) {
        console.error(`[event-stream] Failed to enqueue event for ${runId}:`, e);
        break; // Stop flushing on error
      }
    }
  }
}
