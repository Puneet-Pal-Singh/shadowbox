import { ToolDefinition } from "../interfaces/types";

export const RedisTool: ToolDefinition = {
  name: "check_kv_store",
  description: "Checks the health of the High-Performance Go-Redis Sidecar database.",
  parameters: {
    type: "object",
    properties: {}, // No params needed for health check
    required: []
  }
};