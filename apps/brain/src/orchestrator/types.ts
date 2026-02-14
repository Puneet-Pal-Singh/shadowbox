export type ToolName =
  | "list_files"
  | "read_file"
  | "edit_file"
  | "create_code_artifact"
  | "run_command";

export interface ToolPermission {
  plugin: "filesystem" | "node";
  action: "list_files" | "read_file" | "write_file" | "run";
  allowlistedCommands?: readonly string[];
  enforceWorkspacePath?: boolean;
}

export interface ToolSandbox {
  runIdScope: "required";
  permission: ToolPermission;
}
