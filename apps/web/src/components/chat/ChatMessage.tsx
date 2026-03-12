import { useMemo, useState } from "react";
import type { Message } from "@ai-sdk/react";
import { ArtifactPreview } from "./ArtifactPreview";
import { cn } from "../../lib/utils";
import { FilePill } from "./FilePill";

interface ChatMessageProps {
  message: Message;
  onArtifactOpen?: (path: string, content: string) => void;
}

export function ChatMessage({ message, onArtifactOpen }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [isThinkingVisible, setIsThinkingVisible] = useState(false);

  const { content, thinkingBlocks } = useMemo(() => {
    const rawContent: unknown = message.content;
    let extractedText = "";
    const extractedThinking: string[] = [];

    if (typeof rawContent === "string") {
      extractedText = rawContent;
    } else if (Array.isArray(rawContent)) {
      for (const part of rawContent) {
        if (!part || typeof part !== "object") {
          continue;
        }
        const record = part as Record<string, unknown>;
        const type = typeof record.type === "string" ? record.type : "";
        const text = typeof record.text === "string" ? record.text : "";
        const reasoning =
          typeof record.reasoning === "string" ? record.reasoning : "";

        if (type === "reasoning" || type === "thinking") {
          const block = (text || reasoning).trim();
          if (block) {
            extractedThinking.push(block);
          }
          continue;
        }

        if (text) {
          extractedText += text;
        }
      }
    }

    if (message.role !== "assistant") {
      return {
        content: extractedText.trim(),
        thinkingBlocks: [],
      };
    }

    const parsedText = parseThinkingTags(extractedText);
    const dedupedThinking = Array.from(
      new Set(
        [...extractedThinking, ...parsedText.thinkingBlocks]
          .map((block) => block.trim())
          .filter((block) => block.length > 0),
      ),
    );

    return {
      content: parsedText.visibleContent.trim(),
      thinkingBlocks: dedupedThinking,
    };
  }, [message.content, message.role]);

  // Extract file references from assistant answer content (simple regex)
  const fileRefs =
    content.match(/[\w-]+\.(md|json|ts|tsx|js|jsx|css|html)/g) || [];

  // Unique file references
  const uniqueFileRefs = [...new Set(fileRefs)] as string[];

  return (
    <div
      className={cn(
        "group flex gap-4 w-full",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Message Content */}
      <div className={cn("max-w-4xl", isUser ? "text-right" : "flex-1")}>
        {/* User message bubble */}
        {isUser && content && (
          <div className="inline-block bg-[#262626] text-white px-4 py-2.5 rounded-2xl text-sm leading-relaxed">
            {content}
          </div>
        )}

        {/* Assistant message */}
        {!isUser && (content || thinkingBlocks.length > 0) && (
          <div className="space-y-3">
            {thinkingBlocks.length > 0 && (
              <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/70">
                <button
                  type="button"
                  onClick={() => setIsThinkingVisible((current) => !current)}
                  className="w-full cursor-pointer select-none px-3 py-2 text-left text-xs font-medium text-zinc-300 hover:text-zinc-100"
                >
                  {isThinkingVisible ? "Hide thinking" : "Show thinking"}
                </button>
                {isThinkingVisible && (
                  <div className="space-y-3 border-t border-zinc-800/80 px-3 py-3">
                    {thinkingBlocks.map((block, index) => (
                      <pre
                        key={`thinking-${index}`}
                        className="whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-400"
                      >
                        {block}
                      </pre>
                    ))}
                  </div>
                )}
              </div>
            )}

            {content && (
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {content}
              </div>
            )}

            {/* File references as pills */}
            {uniqueFileRefs.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {uniqueFileRefs.map((filename) => (
                  <FilePill
                    key={filename}
                    filename={filename}
                    onClick={() => console.log("Open file:", filename)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tool Invocations */}
        {message.toolInvocations
          ?.filter((toolInvocation) => {
            // ONLY show major UI artifacts. Everything else is hidden behind 'Thinking' status.
            return toolInvocation.toolName === "create_code_artifact";
          })
          .map((toolInvocation, index) => {
            const toolName = toolInvocation.toolName;
            const status = toolInvocation.state;
            const args = toolInvocation.args as Record<
              string,
              string | undefined
            >;
            const key = toolInvocation.toolCallId || `tool-${index}`;
            const path = args?.path || "untitled";
            const artifactContent = args?.content || "";

            if (toolName === "create_code_artifact" && artifactContent) {
              return (
                <ArtifactPreview
                  key={key}
                  title={path}
                  content={artifactContent}
                  status={status}
                  onOpen={() => onArtifactOpen?.(path, artifactContent)}
                />
              );
            }

            return null;
          })}
      </div>
    </div>
  );
}

function parseThinkingTags(content: string): {
  visibleContent: string;
  thinkingBlocks: string[];
} {
  if (!content) {
    return { visibleContent: "", thinkingBlocks: [] };
  }

  const thinkingBlocks: string[] = [];
  const visibleContent = content.replace(
    /<(thinking|think)>([\s\S]*?)<\/\1>/gi,
    (_match: string, _tag: string, block: string) => {
      const trimmedBlock = block.trim();
      if (trimmedBlock) {
        thinkingBlocks.push(trimmedBlock);
      }
      return "";
    },
  );

  return {
    visibleContent: visibleContent.replace(/\n{3,}/g, "\n\n"),
    thinkingBlocks,
  };
}
