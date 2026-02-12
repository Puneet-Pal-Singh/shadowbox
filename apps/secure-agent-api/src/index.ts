// import { AgentRuntime } from "./core/AgentRuntime";
// import { Sandbox } from '@cloudflare/sandbox';

// export { Sandbox };
// export { AgentRuntime };

// export interface Env {
//   AGENT_RUNTIME: DurableObjectNamespace<AgentRuntime>;
//   Sandbox: DurableObjectNamespace<Sandbox>;
// }

// export default {
//   async fetch(request: Request, env: Env): Promise<Response> {
//     const url = new URL(request.url);

//     // ROUTE 0: WebSocket Connect
//     if (url.pathname === "/connect") {
//       const sessionId = url.searchParams.get("session") || "default";
//       const id = env.AGENT_RUNTIME.idFromName(sessionId);
//       const stub = env.AGENT_RUNTIME.get(id);
      
//       // Pass the Upgrade request to the Durable Object
//       return stub.fetch(request);
//     }

//     // ROUTE 1: Tool Discovery (GET /tools)
//     if (request.method === "GET" && url.pathname === "/tools") {
//       // We create a temporary ID just to query the schema.
//       // Since the schema is code-defined, any instance will return the same result.
//       const id = env.AGENT_RUNTIME.idFromName("system-registry");
//       const stub = env.AGENT_RUNTIME.get(id);
      
//       const tools = await stub.getManifest();
      
//       return Response.json({
//         runtime: "agent-runtime-cf",
//         version: "1.0.0",
//         endpoints: {
//           execute: "POST /?session={id}",
//           discovery: "GET /tools"
//         },
//         tools: tools
//       });
//     }

//     // ROUTE 2: Execution (POST /)
//     if (request.method === "POST") {
//       const sessionId = url.searchParams.get("session") || "default";
//       const id = env.AGENT_RUNTIME.idFromName(sessionId);
//       const stub = env.AGENT_RUNTIME.get(id);

//       const body = await request.json() as { plugin: string; payload: any };
      
//       if (!body.plugin) {
//         return Response.json({ error: "Missing 'plugin' field" }, { status: 400 });
//       }

//       const result = await stub.run(body.plugin, body.payload);
//       return Response.json(result);
//     }

//     // Default: 405 Method Not Allowed
//     return new Response("Method not allowed. Use POST for execution or GET /tools for discovery.", { status: 405 });
//   },
// };

// // src/index.ts
// import { AgentRuntime } from "./core/AgentRuntime";
// import { Sandbox } from '@cloudflare/sandbox';

// export { Sandbox, AgentRuntime };

// const corsHeaders = {
//   "Access-Control-Allow-Origin": "http://localhost:5173", // Tighten this later
//   "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
//   "Access-Control-Allow-Headers": "Content-Type",
//   "Access-Control-Allow-Credentials": "true"
// };

// export default {
//   async fetch(request: Request, env: any): Promise<Response> {
//     const url = new URL(request.url);

//     // 1. Handle CORS Preflight
//     if (request.method === "OPTIONS") {
//       return new Response(null, { headers: corsHeaders });
//     }

//     // 2. Route WebSocket
//     if (url.pathname === "/connect") {
//       const sessionId = url.searchParams.get("session") || "default";
//       const id = env.AGENT_RUNTIME.idFromName(sessionId);
//       return env.AGENT_RUNTIME.get(id).fetch(request);
//     }

//     // 3. Handle Routes
//     let response: Response;
//     try {
//       if (url.pathname === "/tools") {
//         const id = env.AGENT_RUNTIME.idFromName("system-registry");
//         const tools = await env.AGENT_RUNTIME.get(id).getManifest();
//         response = Response.json({ tools });
//       } 
//       else if (request.method === "POST") {
//         const sessionId = url.searchParams.get("session") || "default";
//         const body = await request.json() as { plugin: string; payload: any };
//         const id = env.AGENT_RUNTIME.idFromName(sessionId);
//         const result = await env.AGENT_RUNTIME.get(id).run(body.plugin, body.payload);
//         response = Response.json(result);
//       } 
//       else {
//         response = new Response("Not Found", { status: 404 });
//       }
//     } catch (e: any) {
//       response = Response.json({ error: e.message }, { status: 500 });
//     }

//     // Apply CORS headers to all responses
//     Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
//     return response;
//   },
// };


// solid compliant
// apps/secure-agent-api/src/index.ts
import { AgentRuntime } from "./core/AgentRuntime";
import { Sandbox } from '@cloudflare/sandbox';
import {
  handleCreateSession,
  handleExecuteTask,
  handleStreamLogs,
  handleDeleteSession
} from './api/SessionAPI'

export { Sandbox, AgentRuntime };

/**
 * SRP: Separate Environment definition
 */
export interface Env {
  AGENT_RUNTIME: DurableObjectNamespace<AgentRuntime>;
  Sandbox: DurableObjectNamespace<Sandbox>;
  ARTIFACTS: R2Bucket;
}

interface ExecutionBody {
  plugin: string;
  payload: Record<string, unknown>;
}

/**
 * SOLID: Open/Closed Principle
 * We allow any origin for development but maintain a strict structure for headers
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow Brain (8788) and Web (5173)
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Handle CORS Preflight (Standard Gateway Pattern)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. Identify the Session (Multi-Agent Support)
    const sessionId = url.searchParams.get("session") || "default";
    const id = env.AGENT_RUNTIME.idFromName(sessionId);
    const stub = env.AGENT_RUNTIME.get(id);

    try {
      // 3. Route to proper Durable Object methods
      let response: Response;

      // NEW: HTTP API Routes for CloudSandboxExecutor Integration
      if (url.pathname === "/api/v1/session" && request.method === "POST") {
        return await handleCreateSession(request, stub);
      }

      if (url.pathname === "/api/v1/execute" && request.method === "POST") {
        return await handleExecuteTask(request, stub);
      }

      if (url.pathname.startsWith("/api/v1/logs") && request.method === "GET") {
        return handleStreamLogs(request);
      }

      if (url.pathname.startsWith("/api/v1/session/") && request.method === "DELETE") {
        return handleDeleteSession(request);
      }

      if (url.pathname === "/connect") {
        // Upgrade to WebSocket
        return stub.fetch(request);
      }

      if (url.pathname === "/tools") {
        // Dynamic Tool Discovery for the Brain
        const tools = await stub.getManifest();
        response = Response.json({ tools });
      } 
      else if (url.pathname === "/chat") {
        const runId = url.searchParams.get("runId") || "default";
        
        if (request.method === "GET") {
          const history = await stub.getHistory(runId);
          response = Response.json(history);
        } 
        else if (request.method === "POST") {
          const body = await request.json() as { message?: any, messages?: any[] };
          if (body.message) {
            await stub.appendMessage(runId, body.message);
          } else if (body.messages) {
            await stub.saveHistory(runId, body.messages);
          }
          response = Response.json({ success: true });
        }
        else {
          response = new Response("Method Not Allowed", { status: 405 });
        }
      }
      else if (url.pathname === "/artifact") {
        const key = url.searchParams.get("key");
        if (!key) {
          response = new Response("Missing artifact key", { status: 400 });
        } else {
          const content = await stub.getArtifact(key);
          if (content === null) {
            response = new Response("Artifact not found", { status: 404 });
          } else {
            response = new Response(content, { status: 200 });
          }
        }
      }
      else if (request.method === "POST") {
        // Command Execution
        const body = await request.json() as ExecutionBody;
        
        if (!body.plugin) {
          response = Response.json({ error: "Missing 'plugin' field" }, { status: 400 });
        } else {
          const result = await stub.run(body.plugin, body.payload);
          response = Response.json(result);
        }
      } 
      else {
        response = new Response("Route Not Found", { status: 404 });
      }

      // 4. Final step: Inject CORS into the generated response
      const finalResponse = new Response(response.body, response);
      Object.entries(corsHeaders).forEach(([k, v]) => finalResponse.headers.set(k, v));
      return finalResponse;

    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : "Internal Gateway Error";
      return Response.json({ error }, { status: 500, headers: corsHeaders });
    }
  },
};