import { useCallback, useMemo, useState } from "react";
import type { Message } from "@ai-sdk/react";
import { ArtifactPreview } from "./ArtifactPreview";
import { cn } from "../../lib/utils";
import { FilePill } from "./FilePill";
import type { ChatMessageMetadata } from "./messageMetadata";

interface ChatMessageProps {
  message: Message;
  metadata?: ChatMessageMetadata;
  onArtifactOpen?: (path: string, content: string) => void;
}

export function ChatMessage({
  message,
  metadata,
  onArtifactOpen,
}: ChatMessageProps) {
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
  const metadataText = useMemo(
    () => formatMetadataText(metadata, isUser),
    [isUser, metadata],
  );
  const canCopyContent = content.length > 0;
  const handleCopy = useCallback(async () => {
    if (!canCopyContent || typeof navigator === "undefined") {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
    } catch (error) {
      console.warn("[chat/message] Failed to copy message", error);
    }
  }, [canCopyContent, content]);

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

        {metadataText && (
          <div
            className={cn(
              "mt-2 flex items-center gap-2 text-xs text-zinc-500 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            {!isUser && canCopyContent && (
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="rounded p-1 text-zinc-500 hover:text-zinc-300"
                aria-label="Copy message"
              >
                <CopyIcon />
              </button>
            )}
            <span>{metadataText}</span>
            {isUser && canCopyContent && (
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="rounded p-1 text-zinc-500 hover:text-zinc-300"
                aria-label="Copy message"
              >
                <CopyIcon />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatMetadataText(
  metadata: ChatMessageMetadata | undefined,
  isUser: boolean,
): string {
  if (!metadata) {
    return "";
  }
  const trailing = isUser
    ? metadata.timeLabel
    : metadata.durationLabel ?? metadata.timeLabel;
  return [metadata.modeLabel, metadata.modelLabel, trailing]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(" · ");
}

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
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
