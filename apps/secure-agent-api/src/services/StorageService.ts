import { Message } from "../interfaces/types";

export interface R2Ref {
  type: 'r2_ref';
  key: string;
}

interface CoreToolCallPart {
  type: 'tool-call';
  toolName: string;
  args: {
    path: string;
    content: string | R2Ref;
    [key: string]: unknown;
  };
}

interface ArtifactBucket {
  put(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<unknown>;
}

interface ArtifactBody {
  text(): Promise<string>;
}

export class StorageService {
  constructor(private artifacts: ArtifactBucket) {}

  /**
   * Scans a message for large tool calls (like create_code_artifact) and moves content to R2.
   */
  async processMessage(agentId: string, sessionId: string, message: Message): Promise<Message> {
    const newMessage = { ...message };

    // 1. Check for OpenAI-style assistant tool calls
    if (message.role === 'assistant' && (message as any).tool_calls) {
      const toolCalls = (message as any).tool_calls;
      for (const call of toolCalls) {
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
      const content = message.content as unknown[];
      for (const part of content) {
        const toolPart = part as CoreToolCallPart;
        if (toolPart.type === 'tool-call' && toolPart.toolName === 'create_code_artifact') {
          try {
            const args = toolPart.args;
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
    if (message.role === 'tool' && typeof message.content === 'string' && message.content.length > 5000) {
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
    if (!obj || !isArtifactBody(obj)) return null;
    return await obj.text();
  }
}

function isArtifactBody(value: unknown): value is ArtifactBody {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybeBody = value as { text?: unknown };
  return typeof maybeBody.text === "function";
}
