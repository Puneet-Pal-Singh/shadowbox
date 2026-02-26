export type ChatDebugPhase = "request" | "response" | "finish" | "error";

export interface ChatDebugEvent {
  id: string;
  phase: ChatDebugPhase;
  summary: string;
  timestamp: string;
  payload: unknown;
}
