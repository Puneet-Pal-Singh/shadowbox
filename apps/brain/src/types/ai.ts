// apps/brain/src/types/ai.ts
import type { Ai, Fetcher } from "@cloudflare/workers-types";

export interface Env {
  // Existing bindings
  AI: Ai;
  SECURE_API: Fetcher;

  // ✅ New Keys required for Vercel AI SDK
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  SYSTEM_PROMPT?: string;
}

// export interface Env {
//   AI: Ai;
//   SECURE_API: Fetcher;
// }

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string; // Required for role: 'tool'
  name?: string;         // Optional: name of the tool
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: any; // Ideally typed further based on tool schema
}

export interface AgentResult {
  modelId: string;
  modelName: string;
  content: string;
  toolCalls?: ToolCall[];
}