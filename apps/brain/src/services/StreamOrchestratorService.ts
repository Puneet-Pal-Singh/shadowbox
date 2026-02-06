import type { CoreMessage, CoreTool, TextStreamPart } from "ai";
import type { StreamTextResult } from "ai";
import { AIService } from "./AIService";
import { getCorsHeaders } from "../lib/cors";
import { Env } from "../types/ai";

// Use generic stream result type from AI SDK
interface StreamResult {
  text: string;
  toolCalls: Array<{
    toolName: string;
    args: unknown;
  }>;
  toolResults: Array<unknown>;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  // Additional fields that may be present
  fullMessages?: CoreMessage[];
  steps?: unknown[];
}

export interface StreamOrchestratorOptions {
  messages: CoreMessage[];
  systemPrompt: string;
  tools: Record<string, CoreTool>;
  correlationId: string;
  sessionId: string;
  runId: string;
  requestOrigin?: string;
  onFinish: (result: StreamResult) => Promise<void>;
}

export class StreamOrchestratorService {
  private accumulatedContent = "";
  private lastSyncTime = Date.now();
  private readonly HEARTBEAT_INTERVAL = 5000;

  constructor(
    private aiService: AIService,
    private env: Env,
  ) {}

  async createStream(options: StreamOrchestratorOptions): Promise<Response> {
    const { messages, systemPrompt, tools, correlationId, requestOrigin } = options;

    console.log(
      `[Brain:${correlationId}] Starting AI stream with ${messages.length} messages`,
    );

    try {
      const result = await this.aiService.createChatStream({
        messages,
        systemPrompt,
        tools,
        onChunk: (event) => this.handleChunk(event.chunk, options),
        onFinish: async (finalResult) => {
          await this.handleFinish(finalResult, options);
          await options.onFinish(finalResult);
        },
      });

      // Prepare headers for stream response
      const headers: Record<string, string> = {
        "Access-Control-Allow-Origin": requestOrigin || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-vercel-ai-data-stream, x-ai-sdk-data-stream",
        "Access-Control-Expose-Headers": "x-vercel-ai-data-stream, x-ai-sdk-data-stream",
        "Access-Control-Allow-Credentials": "true",
      };

      return (result as StreamTextResult<Record<string, CoreTool>, unknown>).toDataStreamResponse({
        headers,
      });
    } catch (error) {
      console.error(`[Brain:${correlationId}] Stream creation error:`, error);
      throw error;
    }
  }

  private handleChunk(
    chunk: TextStreamPart<Record<string, CoreTool>>,
    options: StreamOrchestratorOptions,
  ): void {
    const { correlationId, sessionId, runId } = options;

    if (chunk.type === "text-delta") {
      console.log(
        `[Brain:${correlationId}] Text chunk: "${chunk.textDelta?.substring(0, 30)}"`,
      );
      this.accumulatedContent += chunk.textDelta;
    } else if (chunk.type === "tool-call") {
      console.log(`[Brain:${correlationId}] Tool call chunk:`, chunk.toolName);
    }

    this.maybeSendHeartbeat(sessionId, runId);
  }

  private maybeSendHeartbeat(sessionId: string, runId: string): void {
    const now = Date.now();
    if (now - this.lastSyncTime > this.HEARTBEAT_INTERVAL) {
      this.lastSyncTime = now;

      this.env.SECURE_API.fetch(
        `http://internal/chat?session=${sessionId}&runId=${runId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              role: "assistant",
              content: this.accumulatedContent + " ▌",
            },
          }),
        },
      ).catch(() => {});
    }
  }

  private async handleFinish(
    _finalResult: StreamResult,
    options: StreamOrchestratorOptions,
  ): Promise<void> {
    const { correlationId, runId } = options;

    console.log(`[Brain:${correlationId}] Stream finished for run: ${runId}`);
  }
}