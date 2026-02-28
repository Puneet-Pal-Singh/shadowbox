/**
 * NDJSON Response Builder - Stream chat response events as NDJSON
 * 
 * Implements Track 2: Event Envelope Streaming
 * Converts ReadableStream of events into NDJSON-formatted HTTP response
 */

import {
  type ChatResponseEventUnion,
  parseChatResponseEventContract,
  serializeChatResponseEvent,
} from "@repo/shared-types";
import { getCorsHeaders } from "../lib/cors";
import type { Env } from "../types/ai";

/**
 * Build NDJSON streaming response for chat events
 * Each event is serialized to JSON and separated by newline
 *
 * @param request - The incoming HTTP request (for CORS origin)
 * @param env - Cloudflare environment (for CORS configuration)
 * @param eventStream - AsyncIterable of ChatResponseEvents to stream
 * @param runId - The run ID to include in headers
 * @returns Streaming Response with NDJSON body
 */
export async function ndjsonResponse(
  request: Request,
  env: Env,
  eventStream: AsyncIterable<ChatResponseEventUnion>,
  runId: string,
): Promise<Response> {
  // Create a transform stream that converts events to NDJSON bytes
  const transformStream = new TransformStream<ChatResponseEventUnion, Uint8Array>(
    {
      transform(event, controller) {
        try {
          const validatedEvent = assertValidChatResponseEvent(event);
          const serialized = serializeChatResponseEvent(validatedEvent);
          const line = `${serialized}\n`;
          const encoded = new TextEncoder().encode(line);
          controller.enqueue(encoded);
          console.log(
            `[chat/ndjson] Emitted event: ${validatedEvent.type} for run ${validatedEvent.runId}`,
          );
        } catch (error) {
          console.error(
            `[chat/ndjson] Contract validation failed for run ${runId}:`,
            error,
          );
          controller.error(toStreamError(error));
        }
      },
    },
  );

  // Pipe events through the transform stream in background
  // (void fires but doesn't block the response)
  pipeEventsToStream(eventStream, transformStream.writable).catch((error) => {
    console.error(`[chat/ndjson] Event stream error for run ${runId}:`, error);
  });

  return new Response(transformStream.readable, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      "X-Run-Id": runId,
      ...getCorsHeaders(request, env),
    },
  });
}

/**
 * Pipe events to a WritableStream
 * @internal
 */
async function pipeEventsToStream(
  eventStream: AsyncIterable<ChatResponseEventUnion>,
  writable: WritableStream<ChatResponseEventUnion>,
): Promise<void> {
  const writer = writable.getWriter();

  try {
    for await (const event of eventStream) {
      await writer.write(event);
    }
  } catch (error) {
    if (isWritableStreamClosedError(error)) {
      return;
    }
    console.error("[chat/ndjson] Error during event stream:", error);
    throw error;
  } finally {
    try {
      await writer.close();
    } catch (error) {
      if (!isWritableStreamClosedError(error)) {
        throw error;
      }
    }
  }
}

/**
 * Convert a single Response's text stream to NDJSON events
 * Useful for converting plain text responses to NDJSON format
 *
 * @param response - Response with text stream to convert
 * @param runId - The run ID for event generation
 * @returns AsyncIterable of ChatResponseEvents
 */
export async function* textResponseToNdjsonEvents(
  response: Response,
  runId: string,
): AsyncIterable<ChatResponseEventUnion> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    let charIndex = 0;
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Emit any remaining buffered text
        if (buffer.length > 0) {
          yield createValidatedTextDeltaEvent(runId, buffer, charIndex);
        }
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Emit text-delta events in reasonable chunks (avoid single-char events)
      while (buffer.length > 10) {
        const content = buffer.substring(0, 10);
        buffer = buffer.substring(10);

        yield createValidatedTextDeltaEvent(runId, content, charIndex++);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function createValidatedTextDeltaEvent(
  runId: string,
  content: string,
  index: number,
): ChatResponseEventUnion {
  return assertValidChatResponseEvent({
    type: "text-delta",
    runId,
    timestamp: new Date().toISOString(),
    payload: {
      content,
      index,
    },
  });
}

function assertValidChatResponseEvent(
  event: unknown,
): ChatResponseEventUnion {
  const parsed = parseChatResponseEventContract(event);
  return parsed as ChatResponseEventUnion;
}

function toStreamError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Failed to validate chat response event contract");
}

function isWritableStreamClosedError(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes("Invalid state");
}
