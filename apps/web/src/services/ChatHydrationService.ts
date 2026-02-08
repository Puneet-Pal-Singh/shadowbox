import type { Message } from "@ai-sdk/react";

type ToolInvocation = NonNullable<Message['toolInvocations']>[number];

interface ServerToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface CorePart {
  type: 'text' | 'tool-call';
  text?: string;
  toolName?: string;
  toolCallId?: string;
  args?: unknown;
}

interface ServerMessage {
  id?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string | CorePart[];
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
        let content = "";
        let toolInvocations: ToolInvocation[] = [];

        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          // Handle CoreMessage parts
          msg.content.forEach(part => {
            if (part.type === 'text' && part.text) {
              content += part.text;
            } else if (part.type === 'tool-call') {
              toolInvocations.push({
                state: 'result',
                toolCallId: part.toolCallId || `${runId}-tool-${index}`,
                toolName: part.toolName || 'unknown',
                args: part.args || {},
                result: null // Results are pruned or handled separately
              });
            }
          });
        }

        const converted: Message = {
          id: msg.id || `${runId}-msg-${index}`,
          role: msg.role as "system" | "user" | "assistant",
          content,
          createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
        };

        // Handle legacy tool_calls format
        if (msg.role === "assistant" && msg.tool_calls) {
          const legacyTools = this.convertToolCalls(msg.tool_calls, runId);
          toolInvocations = [...toolInvocations, ...legacyTools];
        }

        if (toolInvocations.length > 0) {
          converted.toolInvocations = toolInvocations;
        }

        return converted;
      });
  }

  private convertToolCalls(
    toolCalls: ServerToolCall[],
    runId: string,
  ): ToolInvocation[] {
    return toolCalls.map((tc, tcIndex) => ({
      state: "result" as const,
      toolCallId: tc.id || `${runId}-tool-${tcIndex}`,
      toolName: tc.function?.name || "unknown",
      args: this.parseToolArguments(tc.function?.arguments),
      result: null
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