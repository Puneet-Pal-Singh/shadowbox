import type { Message } from "@ai-sdk/react";

interface ServerToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface ServerMessage {
  id?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ServerToolCall[];
  createdAt?: string | Date;
}

export interface HydrationResult {
  messages: Message[];
  error?: string;
}

export class ChatHydrationService {
  constructor(private apiUrl: string = "http://localhost:8787") {}

  async hydrateMessages(
    sessionId: string,
    runId: string,
  ): Promise<HydrationResult> {
    try {
      const res = await fetch(
        `${this.apiUrl}/chat?session=${sessionId}&runId=${runId}`,
      );

      if (!res.ok) {
        return {
          messages: [],
          error: `History fetch failed: ${res.status} ${res.statusText}`,
        };
      }

      const history: unknown = await res.json();

      if (!Array.isArray(history)) {
        return { messages: [], error: "Invalid history format" };
      }

      const messages = this.convertServerMessages(
        history as ServerMessage[],
        runId,
      );

      return { messages };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { messages: [], error: errorMessage };
    }
  }

  private convertServerMessages(
    history: ServerMessage[],
    runId: string,
  ): Message[] {
    return history
      .filter((msg) => msg.role !== "tool")
      .map((msg, index) => {
        const converted = {
          id: msg.id || `${runId}-msg-${index}`,
          role: msg.role as "system" | "user" | "assistant",
          content: msg.content,
          createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
        };

        if (msg.role === "assistant" && msg.tool_calls) {
          (converted as Message).toolInvocations = this.convertToolCalls(
            msg.tool_calls,
            runId,
          ) as Message["toolInvocations"];
        }

        return converted as Message;
      });
  }

  private convertToolCalls(
    toolCalls: ServerToolCall[],
    runId: string,
  ): Array<{
    state: "result";
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }> {
    return toolCalls.map((tc, tcIndex) => ({
      state: "result" as const,
      toolCallId: tc.id || `${runId}-tool-${tcIndex}`,
      toolName: tc.function?.name || "unknown",
      args: this.parseToolArguments(tc.function?.arguments),
    }));
  }

  private parseToolArguments(
    args: string | undefined,
  ): Record<string, unknown> {
    if (!args) return {};
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
