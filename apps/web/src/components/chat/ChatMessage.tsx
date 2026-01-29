import { type Message } from "ai";
import { User, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ActionBlock } from "./ActionBlock";
import { cn } from "../../lib/utils";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "group flex gap-4 w-full mb-6",
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
              "prose prose-invert prose-p:leading-relaxed prose-pre:p-0 break-words text-sm",
              isUser ? "text-zinc-100" : "text-zinc-300",
            )}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      className="rounded-md my-4"
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={cn("bg-zinc-800 px-1 py-0.5 rounded text-xs", className)} {...props}>
                      {children}
                    </code>
                  );
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Render Tool Calls */}
        {message.toolInvocations?.map((toolInvocation) => {
          const args = toolInvocation.args;

          return (
            <div
              key={toolInvocation.toolCallId}
              className={cn("w-full", isUser && "flex justify-end")}
            >
              <div className="max-w-md w-full text-left">
                <ActionBlock
                  tool={toolInvocation.toolName}
                  status={toolInvocation.state}
                  args={args}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}