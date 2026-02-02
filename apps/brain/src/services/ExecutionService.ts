import { Env } from "../types/ai";

export class ExecutionService {
  constructor(private env: Env, private sessionId: string, private runId: string = sessionId) {}

  async execute(plugin: string, action: string, payload: Record<string, any>) {
    console.log(`[ExecutionService] ${plugin}:${action}`, payload);
    try {
      const res = await this.env.SECURE_API.fetch(
        `http://internal/?session=${this.sessionId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            plugin, 
            payload: { action, runId: this.runId, ...payload } 
          }),
        }
      );

      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || `Failed to execute ${action}`);
      }

      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (error) {
      console.error(`[ExecutionService] Error:`, error);
      throw error;
    }
  }

  async getArtifact(key: string): Promise<string> {
    const res = await this.env.SECURE_API.fetch(
      `http://internal/artifact?key=${encodeURIComponent(key)}`
    );
    if (!res.ok) return "[Error: Artifact not found]";
    return await res.text();
  }
}
