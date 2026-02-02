import { type Message } from "ai";
import { User, Bot } from "lucide-react";
import { ActionBlock } from "./ActionBlock";
import { ArtifactPreview } from "./ArtifactPreview";
import { cn } from "../../lib/utils";

interface ChatMessageProps {
  message: Message;
  onArtifactOpen?: (path: string, content: string) => void;
}

// Simple text display without markdown to avoid crashes
export function ChatMessage({ message, onArtifactOpen }: ChatMessageProps) {
  const isUser = message.role === "user";

  // DEBUG: Log when component renders
  console.log(
    `🧬 [ChatMessage] Rendering ${message.role} message:`,
    message.content?.substring(0, 50),
  );

  return (
    <div
      className={cn(
        "group flex gap-4 w-full mb-8",
        isUser && "flex-row-reverse",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border shadow-sm",
          isUser
            ? "bg-zinc-800 text-zinc-200 border-zinc-700"
            : "bg-emerald-950/30 text-emerald-500 border-emerald-900/50",
        )}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      <div
        className={cn(
          "flex-1 max-w-3xl space-y-2 overflow-hidden",
          isUser && "text-right",
        )}
      >
        {message.content && (
          <div
            className={cn(
              "text-sm whitespace-pre-wrap break-words",
              isUser ? "text-zinc-100" : "text-zinc-300",
            )}
          >
            {typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content)}
          </div>
        )}

        {/* Render Tool Calls - Filter out technical/internal tools */}
        {message.toolInvocations
          ?.filter((toolInvocation: any) => {
            // Only show user-facing tools, hide technical ones
            const visibleTools = ["create_code_artifact"];
            return visibleTools.includes(toolInvocation.toolName);
          })
          .map((toolInvocation: any, index: number) => {
            const toolName = toolInvocation.toolName;
            const status = toolInvocation.state;
            const args = toolInvocation.args as any;
            const key = toolInvocation.toolCallId || `tool-${index}`;

            if (toolName === "create_code_artifact" && args?.content) {
              return (
                <ArtifactPreview
                  key={key}
                  title={args.path || "untitled"}
                  content={args.content}
                  status={status}
                  onOpen={() => onArtifactOpen?.(args.path, args.content)}
                />
              );
            }

            return (
              <div
                key={key}
                className={cn("w-full", isUser && "flex justify-end")}
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
