import { type Message } from "ai";
import { ActionBlock } from "./ActionBlock";
import { ArtifactPreview } from "./ArtifactPreview";
import { cn } from "../../lib/utils";
import { FilePill } from "./FilePill";

interface ChatMessageProps {
  message: Message;
  onArtifactOpen?: (path: string, content: string) => void;
}

export function ChatMessage({ message, onArtifactOpen }: ChatMessageProps) {
  const isUser = message.role === "user";

  // Extract file references from message content (simple regex)
  const fileRefs =
    typeof message.content === "string"
      ? message.content.match(/[\w-]+\.(md|json|ts|tsx|js|jsx|css|html)/g) || []
      : [];

  // Unique file references
  const uniqueFileRefs = [...new Set(fileRefs)];

  return (
    <div
      className={cn(
        "group flex gap-4 w-full",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Message Content */}
      <div className={cn("max-w-3xl", isUser ? "text-right" : "flex-1")}>
        {/* User message bubble */}
        {isUser && message.content && (
          <div className="inline-block bg-[#262626] text-white px-4 py-2.5 rounded-2xl text-sm leading-relaxed">
            {typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content)}
          </div>
        )}

        {/* Assistant message */}
        {!isUser && message.content && (
          <div className="space-y-3">
            <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {typeof message.content === "string"
                ? message.content
                : JSON.stringify(message.content)}
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
            const visibleTools = [
              "create_code_artifact",
              "run_command",
              "list_files",
              "read_file",
              "write_file",
              "make_dir",
            ];
            return visibleTools.includes(toolInvocation.toolName);
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
            const content = args?.content || "";

            if (toolName === "create_code_artifact" && content) {
              return (
                <ArtifactPreview
                  key={key}
                  title={path}
                  content={content}
                  status={status}
                  onOpen={() => onArtifactOpen?.(path, content)}
                />
              );
            }

            return (
              <div
                key={key}
                className={cn("w-full mt-3", isUser && "flex justify-end")}
              >
                <div className="max-w-md w-full text-left">
                  <ActionBlock tool={toolName} status={status} args={args} />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
