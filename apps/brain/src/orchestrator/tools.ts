import { tool, type CoreTool } from "ai";
import { z } from "zod";
import { ExecutionService } from "../services/ExecutionService";
import type { ToolName, ToolSandbox } from "./types";

const ALLOWED_COMMANDS = ["node", "npm", "pnpm", "yarn", "npx", "tsx"] as const;
const UNSAFE_SHELL_PATTERN = /[|&;$`><\r\n]/;

const PATH_SCHEMA = z
  .string()
  .min(1)
  .refine((value) => !value.includes(".."), "Path traversal is not allowed")
  .refine((value) => !value.startsWith("/"), "Absolute paths are not allowed")
  .refine((value) => !/[\0\r\n]/.test(value), "Invalid path characters");

const RUN_COMMAND_SCHEMA = z.object({
  command: z
    .string()
    .min(1, "command required")
    .refine((value) => !UNSAFE_SHELL_PATTERN.test(value), "Unsafe shell token detected"),
});

const TOOL_SANDBOX: Record<ToolName, ToolSandbox> = {
  list_files: {
    runIdScope: "required",
    permission: {
      plugin: "filesystem",
      action: "list_files",
      enforceWorkspacePath: true,
    },
  },
  read_file: {
    runIdScope: "required",
    permission: {
      plugin: "filesystem",
      action: "read_file",
      enforceWorkspacePath: true,
    },
  },
  edit_file: {
    runIdScope: "required",
    permission: {
      plugin: "filesystem",
      action: "write_file",
      enforceWorkspacePath: true,
    },
  },
  create_code_artifact: {
    runIdScope: "required",
    permission: {
      plugin: "filesystem",
      action: "write_file",
      enforceWorkspacePath: true,
    },
  },
  run_command: {
    runIdScope: "required",
    permission: {
      plugin: "node",
      action: "run",
      allowlistedCommands: ALLOWED_COMMANDS,
    },
  },
};

interface PluginExecutionResult {
  success: boolean;
  output?: unknown;
  content?: unknown;
  error?: unknown;
  data?: unknown;
}

export function createToolRegistry(
  execution: ExecutionService,
): Record<string, CoreTool> {
  return {
    list_files: tool({
      description: "List files in a directory",
      parameters: z.object({
        path: PATH_SCHEMA.default(".").describe("Directory path"),
      }),
      execute: async (input) => {
        try {
          const args = z.object({ path: PATH_SCHEMA.default(".") }).parse(input);
          enforceToolPolicy("list_files", args);
          const data = await executeToolAction(
            execution,
            "list_files",
            args,
          );
          return { success: true, data };
        } catch (error: unknown) {
          return { success: false, error: toErrorMessage(error) };
        }
      },
    }),

    read_file: tool({
      description: "Read the contents of a file",
      parameters: z.object({
        path: PATH_SCHEMA.describe("File path to read"),
      }),
      execute: async (input) => {
        try {
          const args = z.object({ path: PATH_SCHEMA }).parse(input);
          enforceToolPolicy("read_file", args);
          const data = await executeToolAction(execution, "read_file", args);
          return { success: true, content: data };
        } catch (error: unknown) {
          return { success: false, error: toErrorMessage(error) };
        }
      },
    }),

    edit_file: tool({
      description:
        "Edit a file by replacing specific text. Use this for small changes to existing files.",
      parameters: z.object({
        path: PATH_SCHEMA.describe("File path to edit"),
        oldString: z.string().min(1).describe("The exact text to replace"),
        newString: z.string().describe("The new text to insert"),
      }),
      execute: async (input) => {
        try {
          const args = z
            .object({
              path: PATH_SCHEMA,
              oldString: z.string().min(1),
              newString: z.string(),
            })
            .parse(input);
          enforceToolPolicy("edit_file", args);

          const readResult = normalizeExecutionResult(
            await executeToolAction(execution, "read_file", {
              path: args.path,
            }),
          );
          if (!readResult.success) {
            return {
              success: false,
              error: `Cannot read file: ${String(readResult.error ?? "Unknown error")}`,
            };
          }

          const content = toTextContent(readResult);
          if (!content.includes(args.oldString)) {
            return {
              success: false,
              error: "oldString not found in file. The file may have changed.",
            };
          }

          const newContent = content.replace(args.oldString, args.newString);
          await executeToolAction(execution, "edit_file", {
            path: args.path,
            content: newContent,
          });

          return { success: true, path: args.path };
        } catch (error: unknown) {
          return { success: false, error: toErrorMessage(error) };
        }
      },
    }),

    create_code_artifact: tool({
      description: "Write code to a file.",
      parameters: z.object({
        path: PATH_SCHEMA,
        content: z.string(),
        description: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const args = z
            .object({
              path: PATH_SCHEMA,
              content: z.string(),
              description: z.string().optional(),
            })
            .parse(input);
          enforceToolPolicy("create_code_artifact", args);
          const data = await executeToolAction(execution, "create_code_artifact", {
            path: args.path,
            content: args.content,
          });
          return { success: true, path: args.path, data };
        } catch (error: unknown) {
          return { success: false, error: toErrorMessage(error) };
        }
      },
    }),

    run_command: tool({
      description:
        "Run a shell command in the sandbox (e.g., 'node hello.js', 'python3 script.py').",
      parameters: RUN_COMMAND_SCHEMA,
      execute: async (input) => {
        try {
          const args = RUN_COMMAND_SCHEMA.parse(input);
          enforceToolPolicy("run_command", args);
          const result = normalizeExecutionResult(
            await executeToolAction(execution, "run_command", args),
          );
          return {
            success: result.success,
            output: result.output ?? "",
            error: result.error ?? "",
          };
        } catch (error: unknown) {
          return { success: false, error: toErrorMessage(error) };
        }
      },
    }),
  };
}

function enforceToolPolicy(
  toolName: ToolName,
  args: Record<string, unknown>,
): void {
  const sandbox = TOOL_SANDBOX[toolName];
  if (sandbox.permission.enforceWorkspacePath) {
    const pathValue = args.path;
    if (typeof pathValue === "string") {
      PATH_SCHEMA.parse(pathValue);
    }
  }

  if (sandbox.permission.allowlistedCommands) {
    const command = args.command;
    if (typeof command !== "string") {
      throw new Error("Invalid command");
    }
    const commandName = command.trim().split(/\s+/)[0];
    if (!commandName) {
      throw new Error("Invalid command");
    }
    if (!sandbox.permission.allowlistedCommands.includes(commandName)) {
      throw new Error(`Command not allowed: ${commandName}`);
    }
  }
}

async function executeToolAction(
  execution: ExecutionService,
  toolName: ToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  const permission = TOOL_SANDBOX[toolName].permission;
  const result = await execution.execute(permission.plugin, permission.action, args);
  return result;
}

function normalizeExecutionResult(value: unknown): PluginExecutionResult {
  if (isRecord(value) && typeof value.success === "boolean") {
    return {
      success: value.success,
      output: value.output,
      content: value.content,
      error: value.error,
      data: value.data,
    };
  }

  return {
    success: false,
    error: "Invalid execution response",
  };
}

function toTextContent(result: PluginExecutionResult): string {
  if (typeof result.output === "string") {
    return result.output;
  }
  if (typeof result.content === "string") {
    return result.content;
  }
  return "";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const TOOL_PERMISSION_MAP = TOOL_SANDBOX;
