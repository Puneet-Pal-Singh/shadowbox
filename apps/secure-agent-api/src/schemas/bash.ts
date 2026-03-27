import { ToolDefinition } from "../interfaces/types";

export const BashTool: ToolDefinition = {
  name: "run_bash",
  description: "Execute a bounded bash command in the run workspace.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The bash command to execute" },
      cwd: {
        type: "string",
        description: "Optional workspace-relative working directory",
      },
      runId: { type: "string", description: "Canonical run identifier" },
    },
    required: ["command"],
  },
};
