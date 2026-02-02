import { R2Bucket } from "@cloudflare/workers-types";
import { Message } from "../interfaces/types";

export interface R2Ref {
  type: 'r2_ref';
  key: string;
}

export class StorageService {
  constructor(private artifacts: R2Bucket) {}

  /**
   * Scans a message for large tool calls (like create_code_artifact) and moves content to R2.
   */
  async processMessage(agentId: string, sessionId: string, message: Message): Promise<Message> {
    const newMessage = { ...message };

    // 1. Check for OpenAI-style assistant tool calls
    if (message.role === 'assistant' && message.tool_calls) {
      for (const call of message.tool_calls) {
        if (call.function?.name === 'create_code_artifact') {
          try {
            const args = JSON.parse(call.function.arguments);
            if (args.content && typeof args.content === 'string' && args.content.length > 1000) {
              const filename = args.path.split('/').pop() || 'file';
              const key = `artifacts/${sessionId}/${agentId}/${Date.now()}-${filename}`;
              
              await this.uploadArtifact(key, args.content);
              
              args.content = { type: 'r2_ref', key };
              call.function.arguments = JSON.stringify(args);
              console.log(`[StorageService] Moved large artifact to R2 (OpenAI format): ${key}`);
            }
          } catch (e) {
            console.error("[StorageService] Failed to process tool call arguments", e);
          }
        }
      }
    }

    // 2. Check for Vercel AI SDK CoreMessage style assistant tool calls
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const part of (message.content as any[])) {
        if (part.type === 'tool-call' && part.toolName === 'create_code_artifact') {
          try {
            const args = part.args;
            if (args.content && typeof args.content === 'string' && args.content.length > 1000) {
              const filename = args.path.split('/').pop() || 'file';
              const key = `artifacts/${sessionId}/${agentId}/${Date.now()}-${filename}`;
              
              await this.uploadArtifact(key, args.content);
              
              args.content = { type: 'r2_ref', key };
              console.log(`[StorageService] Moved large artifact to R2 (CoreMessage format): ${key}`);
            }
          } catch (e) {
            console.error("[StorageService] Failed to process CoreMessage tool call", e);
          }
        }
      }
    }

    // 3. Check for large tool results (e.g. read_file output)
    if (message.role === 'tool' && typeof (message as any).content === 'string' && (message as any).content.length > 5000) {
        // We could also move large read outputs to R2
    }

    return newMessage;
  }

  async uploadArtifact(key: string, content: string): Promise<string> {
    await this.artifacts.put(key, content);
    return key;
  }

  async getArtifact(key: string): Promise<string | null> {
    const obj = await this.artifacts.get(key);
    if (!obj) return null;
    return await obj.text();
  }
}
