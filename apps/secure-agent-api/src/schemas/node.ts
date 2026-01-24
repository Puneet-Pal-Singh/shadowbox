import { ToolDefinition } from "../interfaces/types";

export const NodeTool: ToolDefinition = {
  name: "run_node",
  description: "Execute JavaScript or TypeScript code. Use this for web automation, JSON processing, or tool building.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "The JS/TS code to execute" },
      isTypeScript: { type: "boolean", description: "Whether the code is TS (true) or JS (false)" }
    },
    required: ["code"]
  }
};