// src/core/AgentRuntime.ts
import { DurableObject } from "cloudflare:workers";
import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
import { IPlugin, PluginResult, LogCallback } from "../interfaces/types";

// New import for streaming logs
import { StreamHandler } from "./StreamHandler"; // Import new helper

// Plugins
import { PythonPlugin } from "../plugins/PythonPlugin";
import { RedisPlugin } from "../plugins/RedisPlugin";
import { FileSystemPlugin } from "../plugins/FileSystemPlugin";
import { GitPlugin } from "../plugins/GitPlugin";
import { NodePlugin } from "../plugins/NodePlugin"; // Create this similarly to Python
import { RustPlugin } from "../plugins/RustPlugin";

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
    this.registerPlugin(new NodePlugin());
    this.registerPlugin(new RustPlugin());
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

      // This allows the WebSocket to return 101 immediately.
      this.initializePlugins().catch(e => {
        this.stream.broadcast("error", `Initialization failed: ${e.message}`);
      }); // Setup plugins in background
    }
    return this.sandbox;
  }

  // private async initializePlugins() {
  //   if (!this.sandbox) return;
    
  //   for (const plugin of this.plugins.values()) {
  //     if (plugin.setup) {
  //       this.stream.broadcast("system", `Starting ${plugin.name}...`);
  //       // Setup runs in background
  //       plugin.setup(this.sandbox).catch(e => {
  //           this.stream.broadcast("error", `${plugin.name} failed: ${e.message}`);
  //       });
  //     }
  //   }
  // }
  private async initializePlugins() {
    if (!this.sandbox) return;
    for (const plugin of this.plugins.values()) {
      if (plugin.setup) {
        this.stream.broadcast("system", `Starting ${plugin.name}...`);
        await plugin.setup(this.sandbox);
      }
    }
    this.stream.broadcast("system", "All systems ready.");
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