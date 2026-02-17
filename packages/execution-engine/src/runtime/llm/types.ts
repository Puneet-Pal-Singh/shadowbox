import type { CoreMessage, CoreTool } from "ai";
import type { ZodSchema } from "zod";
import type { LLMUsage } from "../cost/index.js";

export type LLMPhase = "planning" | "task" | "synthesis" | "memory";

export interface LLMCallContext {
  runId: string;
  sessionId: string;
  taskId?: string;
  agentType: string;
  phase: LLMPhase;
  idempotencyKey?: string;
}

export interface LLMTextRequest {
  context: LLMCallContext;
  model?: string;
  providerId?: string;
  messages: CoreMessage[];
  temperature?: number;
  system?: string;
  tools?: Record<string, CoreTool>;
}

export interface LLMStructuredRequest<T> {
  context: LLMCallContext;
  model?: string;
  providerId?: string;
  messages: CoreMessage[];
  schema: ZodSchema<T>;
  temperature?: number;
}

export interface LLMTextResponse {
  text: string;
  usage: LLMUsage;
  providerRequestId?: string;
}

export interface LLMStructuredResponse<T> {
  object: T;
  usage: LLMUsage;
  providerRequestId?: string;
}

export interface ILLMGateway {
  generateText(req: LLMTextRequest): Promise<LLMTextResponse>;
  generateStructured<T>(
    req: LLMStructuredRequest<T>,
  ): Promise<LLMStructuredResponse<T>>;
  generateStream(req: LLMTextRequest): Promise<ReadableStream<Uint8Array>>;
}

export interface LLMRuntimeAIService {
  getProvider(): string;
  getDefaultModel(): string;
  generateText(input: {
    messages: CoreMessage[];
    model?: string;
    providerId?: string;
    temperature?: number;
    system?: string;
  }): Promise<{ text: string; usage: LLMUsage }>;
  generateStructured<T>(input: {
    messages: CoreMessage[];
    schema: ZodSchema<T>;
    model?: string;
    providerId?: string;
    temperature?: number;
  }): Promise<{ object: T; usage: LLMUsage }>;
  createChatStream(input: {
    messages: CoreMessage[];
    system?: string;
    tools?: Record<string, CoreTool>;
    model?: string;
    providerId?: string;
    temperature?: number;
    onFinish?: (result: { usage: LLMUsage }) => void | Promise<void>;
  }): Promise<ReadableStream<Uint8Array>>;
}
