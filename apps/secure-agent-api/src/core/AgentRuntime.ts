// // src/core/AgentRuntime.ts
// import { DurableObject } from "cloudflare:workers";
// import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
// import { IPlugin, PluginResult } from "../interfaces/types";
// import { PythonPlugin } from "../plugins/PythonPlugin";
// import { RedisPlugin } from "../plugins/RedisPlugin";
// import { FileSystemPlugin } from "../plugins/FileSystemPlugin";
// import { GitPlugin } from "../plugins/GitPlugin";
// import { StreamHandler } from "./StreamHandler"; // Import new helper

// export class AgentRuntime extends DurableObject {
//   private sandbox: Sandbox | null = null;
//   private plugins: Map<string, IPlugin> = new Map();
//   private stream = new StreamHandler(); // Init StreamHandler

//   // NEW: Helper to aggregate all tool definitions
//   getManifest() {
//     const manifest = [];
//     for (const plugin of this.plugins.values()) {
//       // Collect tools from every registered plugin
//       manifest.push(...plugin.tools);
//     }
//     return manifest;
//   }

//   constructor(ctx: DurableObjectState, env: any) {
//     super(ctx, env);
    
//     // Register the capabilities of this Runtime
//     this.registerPlugin(new PythonPlugin());
//     this.registerPlugin(new RedisPlugin()); 
//     this.registerPlugin(new FileSystemPlugin()); 
//     this.registerPlugin(new GitPlugin());
//   }

//   private registerPlugin(plugin: IPlugin) {
//     this.plugins.set(plugin.name, plugin);
//   }

//   // Singleton pattern to get or initialize the sandbox
//   private async getSandbox(env: any): Promise<Sandbox> {
//     if (!this.sandbox) {
//       // Use the Durable Object ID as the Sandbox ID (Truncated to safe length)
//       const shortId = this.ctx.id.toString().substring(0, 50);
//       this.stream.broadcast("system", `Initializing Sandbox: ${shortId}`); // Stream event
//       console.log(`[AgentRuntime] Initializing Sandbox Session: ${shortId}`);
      
//       this.sandbox = getSandbox(env.Sandbox, shortId);

//       // Lifecycle Hook: Boot Plugins
//       // This is where Redis gets started when the session first wakes up
//       for (const plugin of this.plugins.values()) {
//         if (plugin.setup) {
//           console.log(`[AgentRuntime] Booting plugin: ${plugin.name}`);
//           try {
//             await plugin.setup(this.sandbox);
//           } catch (e: any) {
//             console.error(`[AgentRuntime] Failed to setup plugin '${plugin.name}':`, e);
//             // We log but don't throw, so other plugins can still work
//           }
//         }
//       }
//     }
//     return this.sandbox;
//   }

//   // The Main Entrypoint for the Worker
//   async run(pluginName: string, payload: any): Promise<PluginResult> {
//     // Ensure sandbox is ready
//     const sb = await this.getSandbox(this.env);
    
//     // Find the requested feature
//     const plugin = this.plugins.get(pluginName);
//     if (!plugin) {
//       return { success: false, error: `Plugin '${pluginName}' not installed in this Runtime.` };
//     }

//     try {
//       // Delegate execution
//       return await plugin.execute(sb, payload);
//     } catch (e: any) {
//       return { success: false, error: e.message };
//     }
//   }
// }


import { DurableObject } from "cloudflare:workers";
import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult, LogCallback } from "../interfaces/types";
import { PythonPlugin } from "../plugins/PythonPlugin";
import { RedisPlugin } from "../plugins/RedisPlugin";
import { FileSystemPlugin } from "../plugins/FileSystemPlugin";
import { GitPlugin } from "../plugins/GitPlugin";
import { StreamHandler } from "./StreamHandler"; // Import new helper

export class AgentRuntime extends DurableObject {
  private sandbox: Sandbox | null = null;
  private plugins: Map<string, IPlugin> = new Map();
  private stream = new StreamHandler(); // Init StreamHandler

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.registerPlugin(new PythonPlugin());
    this.registerPlugin(new RedisPlugin());
    this.registerPlugin(new FileSystemPlugin());
    this.registerPlugin(new GitPlugin());
  }

  private registerPlugin(plugin: IPlugin) {
    this.plugins.set(plugin.name, plugin);
  }

  private async getSandbox(env: any): Promise<Sandbox> {
    if (!this.sandbox) {
      const shortId = this.ctx.id.toString().substring(0, 50);
      this.stream.broadcast("system", `Initializing Sandbox: ${shortId}`); // Stream event
      console.log(`[AgentRuntime] Initializing Sandbox: ${shortId}`);
      
      this.sandbox = getSandbox(env.Sandbox, shortId);

      for (const plugin of this.plugins.values()) {
        if (plugin.setup) {
          this.stream.broadcast("system", `Booting plugin: ${plugin.name}`);
          try {
            await plugin.setup(this.sandbox);
          } catch (e: any) {
            this.stream.broadcast("error", `Plugin setup failed: ${e.message}`);
          }
        }
      }
    }
    return this.sandbox;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // 1. WebSocket Upgrade Route
    if (url.pathname === "/connect") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }
      
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      // Accept the connection
      this.stream.add(server as unknown as WebSocket);
      (server as unknown as WebSocket).accept();

      return new Response(null, { status: 101, webSocket: client });
    }

    // Default fetch behavior (handled by index.ts via stub, or internal calls)
    return new Response("Durable Object Active");
  }

  async run(pluginName: string, payload: any): Promise<PluginResult> {
    const sb = await this.getSandbox(this.env);
    
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      return { success: false, error: `Plugin '${pluginName}' not installed.` };
    }

    // Define the logging callback
    const onLog: LogCallback = (text: string) => {
      this.stream.broadcast("log", text);
    };

    try {
      this.stream.broadcast("start", { plugin: pluginName });
      const result = await plugin.execute(sb, payload, onLog);
      this.stream.broadcast("finish", { success: result.success });
      return result;
    } catch (e: any) {
      this.stream.broadcast("error", e.message);
      return { success: false, error: e.message };
    }
  }

  getManifest() {
    const manifest = [];
    for (const plugin of this.plugins.values()) {
      manifest.push(...plugin.tools);
    }
    return manifest;
  }
}