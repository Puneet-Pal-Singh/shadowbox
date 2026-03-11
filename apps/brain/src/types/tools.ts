export interface SerializableToolDefinition {
  description?: string;
  inputSchema?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}
