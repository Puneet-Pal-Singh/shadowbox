import { useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInputBar } from "./ChatInputBar";
import { ExploredFilesSummary } from "./ExploredFilesSummary";
import { Message } from "ai";

interface ChatInterfaceProps {
  chatProps: {
    messages: Message[];
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: () => void;
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  // Extract file references from messages (mock implementation)
  const fileReferences = ["README.md", "package.json", "tsconfig.json"];

  const handleInputChangeWrapper = (value: string) => {
    // Create a synthetic event to match the expected interface
    const syntheticEvent = {
      target: { value },
    } as React.ChangeEvent<HTMLTextAreaElement>;
    handleInputChange(syntheticEvent);
  };

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Scrollable Messages Container - Centered with max-width */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length > 0 && (
            <ExploredFilesSummary fileCount={fileReferences.length} />
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              onArtifactOpen={onArtifactOpen}
            />
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-500 font-medium bg-zinc-900/30 w-fit rounded-full border border-zinc-800/50 animate-pulse">
              <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" />
              <span>Thinking...</span>
            </div>
          )}
        </div>
      </div>

      {/* Input Area - Centered */}
      <div className="px-6 pb-4">
        <div className="max-w-4xl mx-auto">
          <ChatInputBar
            input={input}
            onChange={handleInputChangeWrapper}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
