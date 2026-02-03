import type { CoreMessage, CoreTool, TextStreamPart, ToolSet } from "ai";
import type { StreamTextResult, StepResult } from "ai";
import { AIService } from "./AIService";
import { CORS_HEADERS } from "../lib/cors";
import { Env } from "../types/ai";

export interface StreamOrchestratorOptions {
  messages: CoreMessage[];
  systemPrompt: string;
  tools: Record<string, CoreTool>;
  correlationId: string;
  sessionId: string;
  runId: string;
  onFinish: (result: StepResult<ToolSet>) => Promise<void>;
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
    const { messages, systemPrompt, tools, correlationId } = options;

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

      return (result as StreamTextResult<ToolSet, unknown>).toDataStreamResponse({
        headers: CORS_HEADERS,
      });
    } catch (error) {
      console.error(`[Brain:${correlationId}] Stream creation error:`, error);
      throw error;
    }
  }

  private handleChunk(
    chunk: TextStreamPart<ToolSet>,
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
    } else if (chunk.type === "tool-result") {
      console.log(
        `[Brain:${correlationId}] Tool result chunk:`,
        chunk.toolName,
        typeof chunk.result === "string"
          ? chunk.result.substring(0, 30)
          : chunk.result,
      );
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
    finalResult: StepResult<ToolSet>,
    options: StreamOrchestratorOptions,
  ): Promise<void> {
    const { correlationId, runId } = options;

    console.log(`[Brain:${correlationId}] Stream finished for run: ${runId}`);
  }
}
