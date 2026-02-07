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
  response: {
    messages: CoreMessage[];
  };
  // Additional fields that may be present
  fullMessages?: CoreMessage[];
  steps?: unknown[];
}

interface CreateChatStreamOptions {
  messages: CoreMessage[];
  fullHistory: CoreMessage[];
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
    fullHistory,
    systemPrompt,
    tools,
    model = "llama-3.3-70b-versatile",
    onFinish,
    onChunk,
  }: CreateChatStreamOptions) {
    // Ensure we have a valid history to fall back on if constructor args are empty
    const baseHistory = fullHistory.length > 0 ? fullHistory : messages;

    return streamText({
      model: this.groq(model),
      messages: messages,
      system: systemPrompt,
      tools,
      maxSteps: 15,
      onFinish: async (result) => {
        console.log(`[AIService] AI Stream Finished. Reason: ${result.finishReason}`);
        
        if (onFinish) {
          // Construct history: Base (all previous + current user) + New (AI + Tools)
          const newMessages = result.response.messages || [];
          
          // Safety: If result.response.messages is somehow missing the text but we have it in result.text
          if (newMessages.length === 0 && result.text) {
             newMessages.push({ 
               id: `assistant-${Date.now()}`, 
               role: 'assistant', 
               content: result.text 
             });
          }

          const finalMessages: CoreMessage[] = [
            ...baseHistory,
            ...newMessages,
          ];
          
          console.log(`[AIService] Persisting ${finalMessages.length} messages. Roles: ${finalMessages.map(m => m.role).join(' -> ')}`);
          await onFinish({ ...result, fullMessages: finalMessages } as unknown as StreamResult);
        }
      },
      onChunk,
    });
  }
}
