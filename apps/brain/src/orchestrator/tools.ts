import { tool, type CoreTool } from "ai";
import { z } from "zod";
import { ExecutionService } from "../services/ExecutionService";

export function createToolRegistry(execution: ExecutionService): Record<string, CoreTool> {
  return {
    list_files: tool({
      description: "List files in the directory",
      parameters: z.object({
        path: z.string().describe("Directory path").default(".")
      }),
      execute: async ({ path }) => {
        try {
          const data = await execution.execute("filesystem", "list_files", { path });
          return { success: true, data };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      },
    }),

    create_code_artifact: tool({
      description: "Write code to a file.",
      parameters: z.object({
        path: z.string(),
        content: z.string(),
        description: z.string().optional(),
      }),
      execute: async ({ path, content }) => {
        try {
          const data = await execution.execute("filesystem", "write_file", { path, content });
          return { success: true, path, data };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      },
    }),

    run_command: tool({
      description: "Run a shell command in the sandbox (e.g., 'node hello.js', 'python3 script.py').",
      parameters: z.object({
        command: z.string().describe("The command to execute"),
      }),
      execute: async ({ command }) => {
        try {
          const data = await execution.execute("node", "run", { command });
          // Ensure we return a structured object the AI can understand
          return { 
            success: data.success, 
            output: data.output || "", 
            error: data.error || "" 
          };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      },
    }),
  };
}
