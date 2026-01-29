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
    model = "llama-3.3-70b-versatile"
  }: {
    messages: any[];
    systemPrompt: string;
    tools: Record<string, CoreTool>;
    model?: string;
  }) {
    return streamText({
      model: this.groq(model) as any,
      messages: convertToCoreMessages(messages),
      system: systemPrompt,
      tools,
      maxSteps: 10,
    });
  }
}
