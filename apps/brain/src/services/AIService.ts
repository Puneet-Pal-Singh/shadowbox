import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { streamText, type CoreTool, type CoreMessage, type TextStreamPart } from "ai";
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

interface CreateChatStreamOptions {
  messages: CoreMessage[];
  systemPrompt: string;
  tools: Record<string, CoreTool>;
  model?: string;
  onFinish?: (result: StreamResult) => Promise<void> | void;
  onChunk?: (event: { chunk: TextStreamPart<Record<string, CoreTool>> }) => void;
}

export class AIService {
  private groq: OpenAIProvider;

  constructor(private env: Env) {
    const apiKey = env.GROQ_API_KEY;
    if (!apiKey) throw new Error("Missing GROQ_API_KEY");

    this.groq = createOpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: apiKey,
    });
  }

  async createChatStream({
    messages,
    systemPrompt,
    tools,
    model = "llama-3.3-70b-versatile",
    onFinish,
    onChunk,
  }: CreateChatStreamOptions) {
    // Messages from ChatController are already CoreMessages
    // Just ensure they're in the right format for the AI SDK
    const coreMessages = messages.length > 0 ? messages : [];

    return streamText({
      model: this.groq(model),
      messages: coreMessages,
      system: systemPrompt,
      tools,
      maxSteps: 10,
      onFinish,
      onChunk,
    });
  }
}
