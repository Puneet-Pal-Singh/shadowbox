import { type Message } from "ai";
import { ArtifactPreview } from "./ArtifactPreview";
import { cn } from "../../lib/utils";
import { FilePill } from "./FilePill";

interface ChatMessageProps {
  message: Message;
  onArtifactOpen?: (path: string, content: string) => void;
}

export function ChatMessage({ message, onArtifactOpen }: ChatMessageProps) {
  const isUser = message.role === "user";

  // Safely extract text content even if it's an array of parts
  const getTextContent = () => {
    const rawContent: unknown = message.content;
    if (typeof rawContent === 'string') return rawContent;
    if (Array.isArray(rawContent)) {
      return (rawContent as Array<{ type: string; text?: string }>)
        .filter((part): part is { type: 'text'; text: string } => 
          part.type === 'text' && typeof part.text === 'string'
        )
        .map(part => part.text)
        .join('');
    }
    return '';
  };

  const content = getTextContent();

  // Extract file references from message content (simple regex)
  const fileRefs = content.match(/[\w-]+\.(md|json|ts|tsx|js|jsx|css|html)/g) || [];

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
        {!isUser && content && (
          <div className="space-y-3">
            <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {content}
            </div>

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
