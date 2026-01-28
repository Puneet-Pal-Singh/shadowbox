import { ToolDefinition } from "../interfaces/types";

export const GitTools: ToolDefinition[] = [
  {
    name: "git_clone",
    description: "Clone a public GitHub repository into the sandbox.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "git_diff",
    description: "View changes made to the codebase. Essential before committing.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "git_commit",
    description: "Commit current changes with a descriptive message.",
    parameters: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"]
    }
  }
];