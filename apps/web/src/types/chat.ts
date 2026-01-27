export type Role = 'user' | 'assistant' | 'system';

export type ModelId = 
  | 'llama-3' 
  | 'claude-3-5' 
  | 'gpt-4o' 
  | 'claude-4.5-sonnet' 
  | 'gpt-5.2-codex';

export interface ToolResult {
  tool: string;
  result: unknown;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  toolResults?: ToolResult[]; // If the agent ran code, we show it here
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  selectedModel: ModelId;
  apiKey: string; // User's BYOK key
}