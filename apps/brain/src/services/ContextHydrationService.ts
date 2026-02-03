import type { CoreMessage, CoreAssistantMessage, CoreToolMessage } from "ai";
import { ExecutionService } from "./ExecutionService";

export class ContextHydrationService {
  constructor(private executionService: ExecutionService) {}

  async hydrateMessages(messages: CoreMessage[]): Promise<CoreMessage[]> {
    return Promise.all(
      messages.map(async (msg) => {
        if (msg.role === "assistant" && Array.isArray((msg as any).content)) {
          return this.hydrateAssistantMessage(msg as any);
        }
        return msg;
      }),
    );
  }

  private async hydrateAssistantMessage(
    msg: CoreAssistantMessage,
  ): Promise<CoreMessage> {
    const content = (msg as any).content as any[];
    const clonedContent = [...content];
    let hasRef = false;

    for (let i = 0; i < clonedContent.length; i++) {
      const part = clonedContent[i];
      if (
        part?.type === "tool-call" &&
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

  private async hydrateArtifactPart(part: any): Promise<any | null> {
    const args = { ...part.args };

    if (
      args.content &&
      typeof args.content === "object" &&
      args.content.type === "r2_ref"
    ) {
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
