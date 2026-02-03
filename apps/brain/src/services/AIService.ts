import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type CoreTool } from "ai";
import { Env } from "../types/ai";

export class AIService {
  private groq;

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
  }: {
    messages: any[];
    systemPrompt: string;
    tools: Record<string, CoreTool>;
    model?: string;
    onFinish?: (result: any) => Promise<void> | void;
    onChunk?: (event: { chunk: any }) => void;
  }) {
    // Messages from ChatController are already CoreMessages
    // Just ensure they're in the right format for the AI SDK
    const coreMessages = messages.length > 0 ? messages : [];

    return streamText({
      model: this.groq(model) as any,
      messages: coreMessages,
      system: systemPrompt,
      tools,
      maxSteps: 10,
      onFinish,
      onChunk,
    });
  }
}
