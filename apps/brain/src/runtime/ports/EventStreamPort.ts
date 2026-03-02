/**
 * EventStreamPort - Boundary for realtime event emission and streaming.
 *
 * This port abstracts the mechanism for emitting structured events to clients.
 * It handles event serialization, transport, and lifecycle.
 *
 * Canonical alignment: RealtimeEventPort (Charter 46)
 */

/**
 * Represents a single event in the execution stream.
 * Events are typed and can be composed into different stream formats (NDJSON, protobuf, etc.).
 */
export interface StreamEvent {
  type:
    | "text-delta"
    | "tool-call"
    | "tool-result"
    | "run-status"
    | "error"
    | "done";
  runId: string;
  timestamp: number;
  correlationId?: string;
  data: unknown;
}

/**
 * Port for emitting and managing realtime events.
 * Abstracts transport and streaming pipeline details.
 */
export interface RealtimeEventPort {
  /**
   * Emit a single event to the stream.
   *
   * @param event - Event to emit
   */
  emit(event: StreamEvent): void;

  /**
   * Emit multiple events in batch.
   *
   * @param events - Events to emit
   */
  emitBatch(events: StreamEvent[]): void;

  /**
   * Mark the stream as complete.
   * No further events will be accepted after this call.
   *
   * @param runId - Run identifier for which to complete the stream
   */
  complete(runId: string): void;

  /**
   * Emit an error event and complete the stream.
   *
   * @param runId - Run identifier
   * @param error - Error information
   */
  error(
    runId: string,
    error: {
      code: string;
      message: string;
      details?: unknown;
    },
  ): void;

  /**
   * Get the underlying stream for this port.
   * Used for returning to HTTP clients.
   *
   * @param runId - Run identifier
   * @returns ReadableStream of serialized events
   */
  getStream(runId: string): ReadableStream<unknown>;
}
