// apps/brain/src/services/DiscoveryService.ts
import { Env, Tool } from "../types/ai";

export class DiscoveryService {
  static async getAvailableTools(env: Env, sessionId: string): Promise<Tool[]> {
    try {
      // Primary: Service Binding
      const res = await env.SECURE_API.fetch("http://muscle/tools");
      const data = await res.json() as { tools: Tool[] };
      return data.tools;
    } catch (e) {
      // Fallback: Local Dev
      console.log("[Discovery] Service binding failed, trying localhost...");
      const localRes = await fetch(`http://localhost:8787/tools?session=${sessionId}`);
      if (!localRes.ok) throw new Error("Sandbox Discovery Unreachable");
      const data = await localRes.json() as { tools: Tool[] };
      return data.tools;
    }
  }
}