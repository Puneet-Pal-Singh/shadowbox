import { ToolDefinition } from "../interfaces/types";

export const RustTool: ToolDefinition = {
  name: "run_rust",
  description: "Compiles and executes a single-file Rust program. Best for high-performance logic or systems tasks.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "The Rust source code" }
    },
    required: ["code"]
  }
};