import { AgentRuntime } from "./core/AgentRuntime";
import { Sandbox } from '@cloudflare/sandbox';

export { Sandbox };
export { AgentRuntime };

export interface Env {
  AGENT_RUNTIME: DurableObjectNamespace<AgentRuntime>;
  Sandbox: DurableObjectNamespace<Sandbox>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ROUTE 0: WebSocket Connect
    if (url.pathname === "/connect") {
      const sessionId = url.searchParams.get("session") || "default";
      const id = env.AGENT_RUNTIME.idFromName(sessionId);
      const stub = env.AGENT_RUNTIME.get(id);
      
      // Pass the Upgrade request to the Durable Object
      return stub.fetch(request);
    }

    // ROUTE 1: Tool Discovery (GET /tools)
    if (request.method === "GET" && url.pathname === "/tools") {
      // We create a temporary ID just to query the schema.
      // Since the schema is code-defined, any instance will return the same result.
      const id = env.AGENT_RUNTIME.idFromName("system-registry");
      const stub = env.AGENT_RUNTIME.get(id);
      
      const tools = await stub.getManifest();
      
      return Response.json({
        runtime: "agent-runtime-cf",
        version: "1.0.0",
        endpoints: {
          execute: "POST /?session={id}",
          discovery: "GET /tools"
        },
        tools: tools
      });
    }

    // ROUTE 2: Execution (POST /)
    if (request.method === "POST") {
      const sessionId = url.searchParams.get("session") || "default";
      const id = env.AGENT_RUNTIME.idFromName(sessionId);
      const stub = env.AGENT_RUNTIME.get(id);

      const body = await request.json() as { plugin: string; payload: any };
      
      if (!body.plugin) {
        return Response.json({ error: "Missing 'plugin' field" }, { status: 400 });
      }

      const result = await stub.run(body.plugin, body.payload);
      return Response.json(result);
    }

    // Default: 405 Method Not Allowed
    return new Response("Method not allowed. Use POST for execution or GET /tools for discovery.", { status: 405 });
  },
};