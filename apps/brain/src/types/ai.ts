import type { Ai, Fetcher } from "@cloudflare/workers-types";

export interface Env {
  AI: Ai;
  SECURE_API: Fetcher;
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

// ✅ This is the interface that was missing/causing error
export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface AgentResult {
  modelId: string;
  modelName: string;
  content: string;
  toolCalls?: ToolCall[];
}