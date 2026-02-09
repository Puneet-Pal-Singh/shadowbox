import { Env } from "../types/ai";
import { decryptToken } from "@shadowbox/github-bridge";

/**
 * ExecutionService - Handles plugin execution with secure token pass-through
 *
 * Following GEMINI.md:
 * - Brain (Control Plane) handles auth and orchestration
 * - Muscle (Data Plane) handles execution
 * - Tokens are passed securely from Brain to Muscle
 */
export class ExecutionService {
  constructor(
    private env: Env,
    private sessionId: string,
    private runId: string = sessionId,
    private userId?: string,
  ) {}

  async execute(
    plugin: string,
    action: string,
    payload: Record<string, unknown>,
  ) {
    console.log(`[ExecutionService] ${plugin}:${action}`, payload);

    try {
      // Check if this is a git operation and we have a userId
      // If so, fetch and inject the GitHub token
      if (plugin === "git" && this.userId) {
        const token = await this.getGitHubToken(this.userId);
        if (token) {
          payload.token = token;
          console.log(`[ExecutionService] Injected GitHub token for ${action}`);
        }
      }

      const res = await this.env.SECURE_API.fetch(
        `http://internal/?session=${this.sessionId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plugin,
            payload: { action, runId: this.runId, ...payload },
          }),
        },
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

  /**
   * Execute with explicit user context for token retrieval
   * This overload allows specifying userId at execution time
   */
  async executeWithUser(
    userId: string,
    plugin: string,
    action: string,
    payload: Record<string, unknown>,
  ) {
    // Temporarily set userId for this execution
    const previousUserId = this.userId;
    this.userId = userId;

    try {
      return await this.execute(plugin, action, payload);
    } finally {
      // Restore previous userId
      this.userId = previousUserId;
    }
  }

  /**
   * Fetch and decrypt GitHub token for a user
   * Tokens are stored encrypted in KV storage
   */
  private async getGitHubToken(userId: string): Promise<string | null> {
    try {
      const sessionData = await this.env.SESSIONS.get(`user_session:${userId}`);
      if (!sessionData) {
        console.log(`[ExecutionService] No session found for user ${userId}`);
        return null;
      }

      const session = JSON.parse(sessionData);
      if (!session.encryptedToken) {
        console.log(
          `[ExecutionService] No GitHub token in session for user ${userId}`,
        );
        return null;
      }

      // Decrypt the token
      const token = await decryptToken(
        session.encryptedToken,
        this.env.GITHUB_TOKEN_ENCRYPTION_KEY,
      );

      console.log(
        `[ExecutionService] Successfully retrieved GitHub token for user ${userId}`,
      );
      return token;
    } catch (error) {
      console.error(`[ExecutionService] Failed to get GitHub token:`, error);
      return null;
    }
  }

  async getArtifact(key: string): Promise<string> {
    const res = await this.env.SECURE_API.fetch(
      `http://internal/artifact?key=${encodeURIComponent(key)}`,
    );
    if (!res.ok) return "[Error: Artifact not found]";
    return await res.text();
  }
}
