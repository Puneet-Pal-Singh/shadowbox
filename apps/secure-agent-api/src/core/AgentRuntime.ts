// apps/secure-agent-api/src/core/AgentRuntime.ts
import { DurableObject } from "cloudflare:workers";
import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
import {
  IPlugin,
  PluginResult,
  LogCallback,
  Message,
} from "../interfaces/types";
import { StreamHandler } from "./StreamHandler";
import { StorageService } from "../services/StorageService";
import { PythonPlugin } from "../plugins/PythonPlugin";
import { RedisPlugin } from "../plugins/RedisPlugin";
import { FileSystemPlugin } from "../plugins/FileSystemPlugin";
import { GitPlugin } from "../plugins/GitPlugin";
import { NodePlugin } from "../plugins/NodePlugin";
import { RustPlugin } from "../plugins/RustPlugin";
import { Env } from "../index";
import {
  sanitizeLogText,
  sanitizeUnknownError,
} from "./security/LogSanitizer";

export class AgentRuntime extends DurableObject {
  private sandbox: Sandbox | null = null;
  private plugins: Map<string, IPlugin> = new Map();
  private stream = new StreamHandler();
  private storageService: StorageService;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.storageService = new StorageService(env.ARTIFACTS as any);
    this.setupRegistry();
  }

  // 1. SRP: Separate Registry logic
  private setupRegistry() {
    [
      new PythonPlugin(),
      new RedisPlugin(),
      new FileSystemPlugin(),
      new GitPlugin(),
      new NodePlugin(),
      new RustPlugin(),
    ].forEach((p) => this.plugins.set(p.name, p));
  }

  // 2. SRP: Sandbox Lifecycle only
  private async ensureSandbox(): Promise<Sandbox> {
    if (!this.sandbox) {
      const shortId = this.ctx.id.toString().substring(0, 50);
      this.sandbox = getSandbox(this.env.Sandbox, shortId);

      // Async boot - don't block the caller
      this.bootPlugins();
    }
    return this.sandbox;
  }

  private async bootPlugins() {
    if (!this.sandbox) return;

    // Log to terminal console for you, but don't spam the user's UI terminal
    console.log("[AgentRuntime] Booting plugins in background...");

    const promises = Array.from(this.plugins.values()).map(async (plugin) => {
      if (plugin.setup) {
        await plugin.setup(this.sandbox!);
      }
    });

    await Promise.all(promises).catch((e) => {
      this.stream.broadcast(
        "error",
        "One or more background services failed to start.",
      );
    });

    // Only one clean message to the user
    this.stream.broadcast("system", "Environment Optimized & Ready");
  }

  // 3. SRP: Pure Protocol Handling (WebSocket Upgrade)
  async fetch(request: Request) {
    const url = new URL(request.url);

    if (
      url.pathname === "/connect" &&
      request.headers.get("Upgrade") === "websocket"
    ) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.stream.add(server as unknown as WebSocket);
      (server as unknown as WebSocket).accept();
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not Found", { status: 404 });
  }

  // 4. SRP: Pure Execution Engine
  async run(pluginName: string, payload: any): Promise<PluginResult> {
    const sb = await this.ensureSandbox();
    const plugin = this.plugins.get(pluginName);

    if (!plugin) return { success: false, error: "Plugin not found" };

    const onLog: LogCallback = (text) => {
      this.stream.broadcast("log", sanitizeLogText(text));
    };

    try {
      // Optional: don't broadcast "start" unless you want a UI spinner
      const result = await plugin.execute(sb, payload, onLog);

      // Crucial: The "finish" event tells the UI to return the prompt
      this.stream.broadcast("finish", { success: result.success });
      return result;
    } catch (e: unknown) {
      const error = sanitizeUnknownError(e);
      this.stream.broadcast("error", error);
      return { success: false, error };
    }
  }

  getManifest() {
    return Array.from(this.plugins.values()).flatMap((p) => p.tools);
  }

  // 5. SRP: History Management
  async getHistory(runId: string): Promise<Message[]> {
    const list = await this.ctx.storage.list<Message>({
      prefix: `chat:${runId}:`,
      limit: 100,
    });
    // Ensure all messages have unique IDs for React rendering
    return Array.from(list.entries()).map(([_, msg], index) => ({
      ...msg,
      id: msg.id || `${runId}-${index}-${Date.now()}`,
    }));
  }

  async appendMessage(runId: string, message: Message): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const sessionId = this.ctx.id.toString();

      // Ensure message has an ID
      const messageWithId: Message = {
        role: message.role,
        content: message.content,
        tool_calls: message.tool_calls,
        tool_call_id: message.tool_call_id,
        id: message.id || `${runId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };

      const processedMessage = await this.storageService.processMessage(
        runId,
        sessionId,
        messageWithId,
      );

      const existing = await this.ctx.storage.list<Message>({
        prefix: `chat:${runId}:`,
        reverse: true,
        limit: 1,
      });

      const lastEntry = Array.from(existing.entries())[0];
      const isPartial =
        message.role === "assistant" &&
        typeof message.content === "string" &&
        message.content.includes("▌");

      if (lastEntry && isPartial) {
        const [lastKey, lastMsg] = lastEntry;
        if (
          lastMsg.role === "assistant" &&
          typeof lastMsg.content === "string" &&
          lastMsg.content.includes("▌")
        ) {
          await this.ctx.storage.put(lastKey, processedMessage);
          return;
        }
      }

      const timestamp = Date.now().toString().padStart(15, "0");
      const key = `chat:${runId}:${timestamp}`;
      await this.ctx.storage.put(key, processedMessage);
    });
  }

  async saveHistory(runId: string, messages: Message[]): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const sessionId = this.ctx.id.toString();

      const existing = await this.ctx.storage.list({
        prefix: `chat:${runId}:`,
      });
      const keysToDelete = Array.from(existing.keys());
      if (keysToDelete.length > 0) {
        await this.ctx.storage.delete(keysToDelete);
      }

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg) continue;

        // Ensure message has an ID
        const msgWithId: Message = {
          role: msg.role,
          content: msg.content,
          tool_calls: msg.tool_calls,
          tool_call_id: msg.tool_call_id,
          id: msg.id || `${runId}-msg-${i}-${Date.now()}`,
        };
        const processedMessage = await this.storageService.processMessage(
          runId,
          sessionId,
          msgWithId,
        );
        const timestamp = Date.now().toString().padStart(15, "0");
        const key = `chat:${runId}:${timestamp}-${i.toString().padStart(3, '0')}`;
        await this.ctx.storage.put(key, processedMessage);
      }
    });
  }

  async getArtifact(key: string): Promise<string | null> {
    return await this.storageService.getArtifact(key);
  }
}
