import { ToolDefinition } from "../interfaces/types";

export const GitTool: ToolDefinition = {
  name: "git_clone",
  description: "Clone a public GitHub repository into the environment to analyze or run code.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The .git URL to clone" }
    },
    required: ["url"]
  }
};