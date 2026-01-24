export type PluginType = "python" | "filesystem" | "rust" | "node" | "git" | "redis";

export interface PluginPayload {
  code?: string;
  action?: string;
  path?: string;
  content?: string;
  url?: string;
  isTypeScript?: boolean;
}

export interface CommandRequest {
  plugin: PluginType;
  payload: PluginPayload;
}

export type WSEvent = 
  | { type: 'log'; data: string }
  | { type: 'finish'; data: { success: boolean } }
  | { type: 'error'; data: string }
  | { type: 'system'; data: string };