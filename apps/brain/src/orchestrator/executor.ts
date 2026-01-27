import { Env, ToolCall } from "../types/ai";

export class AgentOrchestrator {
  constructor(private env: Env, private sessionId: string) {}

  async executeTool(call: ToolCall) {
    console.log(`[Brain] 🧠 -> ⚡️ Executing Tool: ${call.name}`);
    
    // Map LLM tool names to Shadowbox Plugins
    const mapping = this.mapToolToPlugin(call.name, call.arguments);

    if (!mapping) {
      return { error: `Unknown tool: ${call.name}` };
    }

    try {
      // Call the Secure API via Service Binding (Internal Network)
      // We pass the sessionId so it routes to the correct Durable Object
      const res = await this.env.SECURE_API.fetch(`http://internal/?session=${this.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          plugin: mapping.plugin, 
          payload: mapping.payload 
        })
      });

      const data = await res.json();
      return data;

    } catch (e: any) {
      console.error(`[Brain] Execution Failed:`, e);
      return { error: e.message || "Internal Execution Error" };
    }
  }

  // SRP: Separate mapping logic from execution logic
  private mapToolToPlugin(toolName: string, args: any): { plugin: string, payload: any } | null {
    
    // 1. FileSystem Tools
    if (toolName === "list_files") {
      return { plugin: "filesystem", payload: { action: "list_files", path: args.path || "." } };
    }
    if (toolName === "read_file") {
      return { plugin: "filesystem", payload: { action: "read_file", path: args.path } };
    }
    if (toolName === "write_file") {
      return { plugin: "filesystem", payload: { action: "write_file", path: args.path, content: args.content } };
    }
    if (toolName === "make_dir") {
      return { plugin: "filesystem", payload: { action: "make_dir", path: args.path } };
    }

    // 2. Git Tools
    if (toolName === "git_clone") {
      return { plugin: "git", payload: { url: args.url } };
    }

    // 3. Runtime Tools
    if (toolName === "run_python") {
      return { plugin: "python", payload: { code: args.code, requirements: args.requirements } };
    }
    if (toolName === "run_node") {
      return { plugin: "node", payload: { code: args.code, isTypeScript: args.isTypeScript } };
    }
    if (toolName === "run_rust") {
      return { plugin: "rust", payload: { code: args.code } };
    }

    // 4. Redis Tools
    if (toolName === "check_kv_store") {
      return { plugin: "redis", payload: {} };
    }

    return null;
  }
}