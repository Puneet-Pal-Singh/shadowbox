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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = newHeight + "px";
    }
  }, [input]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-full bg-background">
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
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onArtifactOpen={onArtifactOpen}
          />
        ))}
      </div>

      {/* Input Layer - Single Expanding Input */}
      <div className={`px-4 pb-4 bg-[#0c0c0e] transition-all duration-200 ${
        isFocused || input.length > 0 ? "pt-4" : "pt-4"
      } ${isFocused || input.length > 0 ? "border-t border-zinc-800" : ""}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className={`relative flex flex-col gap-2 rounded-xl transition-all duration-200 ${
            isFocused || input.length > 0
              ? "bg-zinc-900/50 border border-zinc-700 p-3"
              : "bg-transparent border border-transparent p-2"
          }`}
        >
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
            >
              <Settings size={18} />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={isLoading}
              placeholder={isFocused || input.length > 0 ? "Ask Shadowbox to write code..." : "Ask Shadowbox to write code..."}
              className="flex-1 bg-transparent border-none focus:ring-0 resize-none text-sm text-zinc-200 placeholder-zinc-600 min-h-10 max-h-48 py-2 font-mono"
              style={{ 
                overflow: "hidden",
                lineHeight: "1.5"
              }}
            />

            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2 bg-white text-black rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-shrink-0"
            >
              <Send size={16} />
            </button>
          </div>

          {/* Show input preview when expanded */}
          {(isFocused || input.length > 0) && input.length > 50 && (
            <div className="ml-10 border-l-2 border-zinc-700 pl-3 py-2">
              <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Preview</div>
              <div className="text-xs text-zinc-300 line-clamp-3 font-mono whitespace-pre-wrap break-words">
                {input}
              </div>
            </div>
          )}
        </form>
        <div className="text-[10px] text-zinc-600 mt-2 text-center">
          AI Agents can make mistakes. Review generated code.
        </div>
      </div>
    </div>
  );
}
