import { ToolDefinition } from "../interfaces/types";

export const PythonTool: ToolDefinition = {
  name: "run_python",
  description: "Executes Python code in a persistent environment. Use this for data analysis, math, or file manipulation.",
  parameters: {
    type: "object",
    properties: {
      code: { 
        type: "string", 
        description: "The Python script to execute" 
      },
      requirements: { 
        type: "array", 
        items: { type: "string" }, 
        description: "List of pip packages to install (e.g. ['pandas', 'requests'])" 
      }
    },
    required: ["code"]
  }
};