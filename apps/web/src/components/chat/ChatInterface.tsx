import { useRef, useEffect, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { Bot, Send, Settings } from "lucide-react";
import { Message } from "ai";

interface ChatInterfaceProps {
  chatProps: {
    messages: Message[];
    input: string;
    handleInputChange: (e: any) => void;
    handleSubmit: (e?: any) => void;
    isLoading: boolean;
  };
  onArtifactOpen?: (path: string, content: string) => void;
}

export function ChatInterface({
  chatProps,
  onArtifactOpen,
}: ChatInterfaceProps) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    chatProps;
  const scrollRef = useRef<HTMLDivElement>(null);

  // TIMING: Track when messages appear
  const [timingInfo, setTimingInfo] = useState<string>("");
  const lastMessageCountRef = useRef(messages.length);
  const messageTimesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const currentCount = messages.length;
    const lastCount = lastMessageCountRef.current;

    if (currentCount !== lastCount) {
      const now = Date.now();
      const timeStr = new Date().toLocaleTimeString();

      if (currentCount === 1 && lastCount === 0) {
        // First message appeared (user message)
        messageTimesRef.current.set("first", now);
        setTimingInfo(`User msg: ${timeStr}`);
      } else if (currentCount === 2 && lastCount === 1) {
        // Second message appeared (assistant started)
        const firstTime = messageTimesRef.current.get("first") || now;
        const delay = ((now - firstTime) / 1000).toFixed(1);
        setTimingInfo(
          `User msg: ${timeStr} | AI response started after ${delay}s`,
        );
      } else if (currentCount > lastCount) {
        // More messages
        setTimingInfo((prev) => `${prev} | Msg ${currentCount}: ${timeStr}`);
      }

      lastMessageCountRef.current = currentCount;
    }
  }, [messages.length]);

  // DEBUG: Log messages on every render
  console.log(
    `🧬 [ChatInterface] Render with ${messages.length} messages:`,
    messages.map((m) => ({
      role: m.role,
      id: m.id?.substring(0, 8),
      content:
        typeof m.content === "string"
          ? m.content.substring(0, 50)
          : typeof m.content,
      hasToolInvocations: !!m.toolInvocations?.length,
      toolCount: m.toolInvocations?.length || 0,
      toolNames: m.toolInvocations?.map((t: any) => t.toolName).join(", "),
    })),
  );

  // DEBUG: Check for assistant messages specifically
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  if (assistantMsgs.length > 0) {
    console.log(
      `🧬 [ChatInterface] Found ${assistantMsgs.length} assistant messages:`,
      assistantMsgs.map((m) => m.content?.substring(0, 30)),
    );
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* DEBUG COUNTER with TIMING - Remove after fix */}
      <div className="bg-red-900/50 text-red-200 px-4 py-1 text-xs font-mono">
        Messages: {messages.length} | Loading: {isLoading ? "YES" : "NO"}
        {timingInfo && (
          <div className="text-yellow-300 mt-1">⏱️ {timingInfo}</div>
        )}
      </div>

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scrollbar-hide"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-20">
            <Bot size={48} className="mb-4 text-accent" />
            <span className="font-mono text-xs tracking-widest uppercase">
              Awaiting Task Parameters
            </span>
          </div>
        )}

        {/* DEBUG: Show raw message data */}
        {messages[0] && (
          <div className="bg-yellow-900/30 border border-yellow-700/50 rounded p-2 mb-4">
            <div className="text-yellow-500 text-xs font-mono mb-1">
              DEBUG - First Message:
            </div>
            <pre className="text-yellow-300 text-xs overflow-auto">
              {JSON.stringify(
                {
                  id: messages[0]?.id,
                  role: messages[0]?.role,
                  contentType: typeof messages[0]?.content,
                  contentPreview:
                    typeof messages[0]?.content === "string"
                      ? messages[0]?.content?.substring(0, 100)
                      : "object",
                },
                null,
                2,
              )}
            </pre>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onArtifactOpen={onArtifactOpen}
          />
        ))}
      </div>

      {/* Input Layer */}
      <div className="p-4 bg-[#0c0c0e] border-t border-zinc-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="relative flex items-end gap-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 focus-within:border-zinc-700 transition-colors"
        >
          <button
            type="button"
            className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Settings size={18} />
          </button>

          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={isLoading}
            placeholder="Ask Shadowbox to write code..."
            className="flex-1 bg-transparent border-none focus:ring-0 resize-none text-sm text-zinc-200 placeholder-zinc-600 h-10 py-2.5 max-h-32"
            rows={1}
          />

          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-2 bg-white text-black rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Send size={16} />
          </button>
        </form>
        <div className="text-[10px] text-zinc-600 mt-2 text-center">
          AI Agents can make mistakes. Review generated code.
        </div>
      </div>
    </div>
  );
}
