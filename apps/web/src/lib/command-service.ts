import { CommandRequest, PluginType } from "../types/terminal";

export const CommandService = {
  parse(input: string): CommandRequest {
    const trimmed = input.trim();
    const parts = trimmed.split(/\s+/); // Handle multiple spaces
    const base = parts[0];
    const args = parts.slice(1);
    const fullArgs = args.join(" ");

    // File System Handling
    if (base === 'ls') {
      return { plugin: "filesystem", payload: { action: "list_files", path: args[0] || "." } };
    }
    if (base === 'cat') {
      return { plugin: "filesystem", payload: { action: "read_file", path: args[0] } };
    }
    if (base === 'mkdir') {
      return { plugin: "filesystem", payload: { action: "make_dir", path: args[0] } };
    }

    // Polyglot Runtime Handling
    if (base === "rust") {
      return { plugin: "rust", payload: { code: fullArgs } };
    }
    if (base === "node" || base === "ts") {
      return { plugin: "node", payload: { code: fullArgs, isTypeScript: base === "ts" } };
    }

    // Git Handling
    if (base === "git" && args[0] === "clone") {
      return { plugin: "git", payload: { url: args[1] } };
    }

    // Default: Python
    return { 
      plugin: "python" as PluginType, 
      payload: { code: trimmed } 
    };
  }
};