import { useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { ThreadHeader } from "./ThreadHeader";
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
  threadTitle?: string;
  onArtifactOpen?: (path: string, content: string) => void;
}

export function ChatInterface({
  chatProps,
  threadTitle = "Review shadowbox README",
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
      {/* Thread Header */}
      <ThreadHeader title={threadTitle} />

      {/* Scrollable Messages Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
      >
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
        {isLoading && messages.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" />
            <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.1s]" />
            <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.2s]" />
          </div>
        )}
      </div>

      {/* Input Area */}
      <ChatInputBar
        input={input}
        onChange={handleInputChangeWrapper}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  );
}
