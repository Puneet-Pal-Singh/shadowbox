import type { CoreMessage, CoreTool } from "ai";
import type { AIService, GenerateTextResult } from "./AIService";
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
  fullHistory: CoreMessage[];
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
  private accumulatedToolCalls: Array<{ toolName: string; args: unknown }> = [];
  private lastSyncTime = Date.now();
  private readonly HEARTBEAT_INTERVAL = 5000;

  constructor(
    private aiService: AIService,
    private env: Env,
  ) {}

  async createStream(options: StreamOrchestratorOptions): Promise<Response> {
    const { messages, systemPrompt, tools, correlationId, requestOrigin } =
      options;

    // Reset accumulators for new stream
    this.accumulatedContent = "";
    this.accumulatedToolCalls = [];

    console.log(
      `[Brain:${correlationId}] Starting AI stream with ${messages.length} messages`,
    );

    try {
      // Phase 3.1: createChatStream now returns a ReadableStream<Uint8Array>
      const stream = await this.aiService.createChatStream({
        messages,
        system: systemPrompt,
        tools,
        onChunk: (chunk) => this.handleChunk(chunk, options),
        onFinish: async (finalResult) => {
          await this.handleFinish(finalResult, options);
          // Convert GenerateTextResult to StreamResult format with accumulated tool calls
          const streamResult: StreamResult = {
            text: finalResult.text,
            toolCalls: [...this.accumulatedToolCalls],
            toolResults: [],
            finishReason: finalResult.finishReason ?? "stop",
            usage: {
              promptTokens: finalResult.usage.promptTokens,
              completionTokens: finalResult.usage.completionTokens,
            },
          };
          await options.onFinish(streamResult);
        },
      });

      // Return stream with proper headers for Vercel AI SDK
      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": requestOrigin || "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    } catch (error) {
      console.error(`[Brain:${correlationId}] Stream creation error:`, error);
      throw error;
    }
  }

  private handleChunk(
    chunk: { content?: string; toolCall?: { toolName: string; args: unknown } },
    options: StreamOrchestratorOptions,
  ): void {
    const { correlationId, sessionId, runId } = options;

    if (chunk.content) {
      console.log(
        `[Brain:${correlationId}] Text chunk: "${chunk.content.substring(0, 30)}"`,
      );
      this.accumulatedContent += chunk.content;
    } else if (chunk.toolCall) {
      console.log(
        `[Brain:${correlationId}] Tool call chunk:`,
        chunk.toolCall.toolName,
      );
      // Accumulate tool calls
      this.accumulatedToolCalls.push(chunk.toolCall);
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
    finalResult: GenerateTextResult,
    options: StreamOrchestratorOptions,
  ): Promise<void> {
    const { correlationId, runId } = options;

    console.log(`[Brain:${correlationId}] Stream finished for run: ${runId}`);
    console.log(
      `[Brain:${correlationId}] Usage: ${finalResult.usage.totalTokens} tokens`,
    );
  }
}
