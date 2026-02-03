import type { CoreMessage, CoreAssistantMessage, CoreToolMessage } from "ai";
import { ExecutionService } from "./ExecutionService";

interface ToolCallPart {
  type: "tool-call";
  toolName: string;
  toolCallId: string;
  args: {
    content?: string | { type: string; key: string };
    path?: string;
    [key: string]: unknown;
  };
}

interface R2Ref {
  type: "r2_ref";
  key: string;
}

function isToolCallPart(part: unknown): part is ToolCallPart {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    (part as Record<string, unknown>).type === "tool-call" &&
    "toolName" in part &&
    typeof (part as Record<string, unknown>).toolName === "string"
  );
}

function isR2Ref(value: unknown): value is R2Ref {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as Record<string, unknown>).type === "r2_ref" &&
    "key" in value &&
    typeof (value as Record<string, unknown>).key === "string"
  );
}

function hasArrayContent(msg: CoreAssistantMessage): msg is CoreAssistantMessage & { content: ToolCallPart[] } {
  return Array.isArray(msg.content);
}

export class ContextHydrationService {
  constructor(private executionService: ExecutionService) {}

  async hydrateMessages(messages: CoreMessage[]): Promise<CoreMessage[]> {
    return Promise.all(
      messages.map(async (msg) => {
        if (msg.role === "assistant" && hasArrayContent(msg)) {
          return this.hydrateAssistantMessage(msg);
        }
        return msg;
      }),
    );
  }

  private async hydrateAssistantMessage(
    msg: CoreAssistantMessage & { content: ToolCallPart[] },
  ): Promise<CoreMessage> {
    const clonedContent = [...msg.content];
    let hasRef = false;

    for (let i = 0; i < clonedContent.length; i++) {
      const part = clonedContent[i];
      if (
        isToolCallPart(part) &&
        part.toolName === "create_code_artifact"
      ) {
        const hydrated = await this.hydrateArtifactPart(part);
        if (hydrated) {
          clonedContent[i] = hydrated;
          hasRef = true;
        }
      }
    }

    if (hasRef) {
      return { ...msg, content: clonedContent } as CoreMessage;
    }
    return msg;
  }

  private async hydrateArtifactPart(
    part: ToolCallPart,
  ): Promise<ToolCallPart | null> {
    const args = { ...part.args };

    if (isR2Ref(args.content)) {
      try {
        const actualContent = await this.executionService.getArtifact(
          args.content.key,
        );
        args.content = actualContent;
        return { ...part, args };
      } catch (e) {
        console.error("[Brain] R2 Hydration failed", e);
      }
    }

    return null;
  }

  pruneToolResults(messages: CoreMessage[]): CoreMessage[] {
    return messages.map((msg, index) => {
      const isLastTurn = index >= messages.length - 2;

      if (!isLastTurn && msg.role === "tool") {
        return this.pruneToolMessage(msg as CoreToolMessage);
      }

      return msg;
    });
  }

  private pruneToolMessage(msg: CoreToolMessage): CoreToolMessage {
    const content = msg.content;

    return {
      ...msg,
      content: content.map((part) => {
        if (
          part.type === "tool-result" &&
          (part.toolName === "run_command" || part.toolName === "read_file")
        ) {
          const result =
            typeof part.result === "string"
              ? part.result
              : JSON.stringify(part.result);

          if (result.includes("... and") || result.length > 500) {
            return {
              ...part,
              result:
                "[Previous technical output hidden to prevent context bloat]",
            };
          }
        }
        return part;
      }),
    };
  }
}
