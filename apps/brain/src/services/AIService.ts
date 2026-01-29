import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToCoreMessages, type CoreTool } from "ai";
import { Env } from "../types/ai";

export class AIService {
  private groq;

  constructor(private env: Env) {
    const apiKey = env.GROQ_API_KEY;
    if (!apiKey) throw new Error("Missing GROQ_API_KEY");

    this.groq = createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: apiKey,
    });
  }

  async createChatStream({
    messages,
    systemPrompt,
    tools,
    model = "llama-3.3-70b-versatile",
    onFinish,
    onChunk
  }: {
    messages: any[];
    systemPrompt: string;
    tools: Record<string, CoreTool>;
    model?: string;
    onFinish?: (result: any) => Promise<void> | void;
    onChunk?: (event: { chunk: any }) => void;
  }) {
    // Determine if messages need conversion (raw client messages vs internal CoreMessages)
    // Add safety check for empty messages array
    const coreMessages = messages.length > 0 && messages[0] && 'role' in messages[0] && !('toolInvocations' in messages[0]) 
      ? messages 
      : convertToCoreMessages(messages);

    return streamText({
      model: this.groq(model) as any,
      messages: coreMessages,
      system: systemPrompt,
      tools,
      maxSteps: 10,
      onFinish,
      onChunk
    });
  }
}
