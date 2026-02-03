import { tool, type CoreTool } from "ai";
import { z } from "zod";
import { ExecutionService } from "../services/ExecutionService";

export function createToolRegistry(
  execution: ExecutionService,
): Record<string, CoreTool> {
  return {
    list_files: tool({
      description: "List files in a directory",
      parameters: z.object({
        path: z.string().describe("Directory path").default("."),
      }),
      execute: async ({ path }) => {
        try {
          const data = await execution.execute("filesystem", "list_files", {
            path,
          });
          return { success: true, data };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      },
    }),

    read_file: tool({
      description: "Read the contents of a file",
      parameters: z.object({
        path: z.string().describe("File path to read"),
      }),
      execute: async ({ path }) => {
        try {
          const data = await execution.execute("filesystem", "read_file", {
            path,
          });
          return { success: true, content: data };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      },
    }),

    edit_file: tool({
      description:
        "Edit a file by replacing specific text. Use this for small changes to existing files.",
      parameters: z.object({
        path: z.string().describe("File path to edit"),
        oldString: z.string().describe("The exact text to replace"),
        newString: z.string().describe("The new text to insert"),
      }),
      execute: async ({ path, oldString, newString }) => {
        try {
          // First read the file
          const readResult = await execution.execute(
            "filesystem",
            "read_file",
            { path },
          );
          if (!readResult.success) {
            return {
              success: false,
              error: `Cannot read file: ${readResult.error}`,
            };
          }

          const content = readResult.output || readResult.content || "";
          if (!content.includes(oldString)) {
            return {
              success: false,
              error: "oldString not found in file. The file may have changed.",
            };
          }

          const newContent = content.replace(oldString, newString);
          await execution.execute("filesystem", "write_file", {
            path,
            content: newContent,
          });
          return { success: true, path };
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
          const data = await execution.execute("filesystem", "write_file", {
            path,
            content,
          });
          return { success: true, path, data };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      },
    }),

    run_command: tool({
      description:
        "Run a shell command in the sandbox (e.g., 'node hello.js', 'python3 script.py').",
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
            error: data.error || "",
          };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      },
    }),
  };
}
