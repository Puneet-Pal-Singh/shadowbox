import { ToolDefinition } from "../interfaces/types";

export const FileSystemTools: ToolDefinition[] = [
  {
    name: "list_files",
    description: "List files and directories in the current path. Use this to explore the environment.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path (default: .)" }
      }
    }
  },
  {
    name: "read_file",
    description: "Read the text content of a file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file" }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Write text content to a file. Overwrites if exists.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file" },
        content: { type: "string", description: "The content to write" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "make_dir",
    description: "Create a new directory.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to create" }
      },
      required: ["path"]
    }
  }
];