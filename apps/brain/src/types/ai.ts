// apps/brain/src/types/ai.ts
import type {
  Ai,
  DurableObjectNamespace,
  Fetcher,
  KVNamespace,
} from "@cloudflare/workers-types";

export interface Env {
  // Existing bindings
  AI: Ai;
  SECURE_API: Fetcher;

  // ✅ New Keys required for Vercel AI SDK
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENAI_API_KEY?: string;
  SYSTEM_PROMPT?: string;

  // ✅ LLM Provider Configuration (Phase 3.1)
  LLM_PROVIDER?: "litellm" | "openai" | "anthropic";
  DEFAULT_MODEL?: string;
  LITELLM_BASE_URL?: string;
  COST_UNKNOWN_PRICING_MODE?: "warn" | "block";
  COST_FAIL_ON_UNSEEDED_PRICING?: "true" | "false";
  MAX_RUN_BUDGET?: string;
  MAX_SESSION_BUDGET?: string;

  // ✅ GitHub OAuth & Session Management
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  GITHUB_TOKEN_ENCRYPTION_KEY: string;
  SESSION_SECRET: string;
  FRONTEND_URL: string;
  CORS_ALLOWED_ORIGINS?: string;
  CORS_ALLOW_DEV_ORIGINS?: "true" | "false";

  // Service URLs (environment-driven, not hardcoded)
  MUSCLE_BASE_URL?: string;

  // KV Namespace for sessions
  SESSIONS: KVNamespace;

  // Durable Object binding for RunEngine runtime state
  RUN_ENGINE_RUNTIME: DurableObjectNamespace;

  // Session Memory Runtime for cross-run memory storage (optional)
  SESSION_MEMORY_RUNTIME?: DurableObjectNamespace;

  // Environment
  NODE_ENV?: string;
}

// export interface Env {
//   AI: Ai;
//   SECURE_API: Fetcher;
// }

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: MessageRole;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string; // Required for role: 'tool'
  name?: string; // Optional: name of the tool
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface AgentResult {
  modelId: string;
  modelName: string;
  content: string;
  toolCalls?: ToolCall[];
}
