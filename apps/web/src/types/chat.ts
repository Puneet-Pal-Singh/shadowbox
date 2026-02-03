// export type Role = 'user' | 'assistant' | 'system';

// export type ModelId =
//   | 'llama-3'
//   | 'claude-3-5'
//   | 'gpt-4o'
//   | 'claude-4.5-sonnet'
//   | 'gpt-5.2-codex';

// export interface ToolResult {
//   tool: string;
//   result: unknown;
// }

// export interface ChatMessage {
//   id: string;
//   role: Role;
//   content: string;
//   timestamp: number;
//   toolResults?: ToolResult[]; // If the agent ran code, we show it here
// }

// export interface ChatState {
//   messages: ChatMessage[];
//   isLoading: boolean;
//   selectedModel: ModelId;
//   apiKey: string; // User's BYOK key
// }

export type MessageRole = "user" | "assistant" | "system";
export type ActionStatus = "running" | "success" | "error";

export interface ToolExecution {
  tool: string;
  status: ActionStatus;
  result?: unknown;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  executions?: ToolExecution[];
  timestamp: number;
}

export interface ArtifactData {
  path: string;
  content: string;
}

export interface ArtifactState {
  artifact: ArtifactData | null;
  setArtifact: (artifact: ArtifactData | null) => void;
  isArtifactOpen: boolean;
  setIsArtifactOpen: (isOpen: boolean) => void;
}
