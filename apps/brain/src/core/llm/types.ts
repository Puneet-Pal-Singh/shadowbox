import type { CoreMessage, CoreTool } from "ai";
import type { ZodSchema } from "zod";
import type { LLMUsage } from "../cost";

export type LLMPhase = "planning" | "task" | "synthesis";

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
  messages: CoreMessage[];
  temperature?: number;
  system?: string;
  tools?: Record<string, CoreTool>;
}

export interface LLMStructuredRequest<T> {
  context: LLMCallContext;
  model?: string;
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
