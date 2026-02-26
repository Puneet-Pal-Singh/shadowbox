import { useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInputBar } from "./ChatInputBar";
import { ExploredFilesSummary } from "./ExploredFilesSummary";
import { ChatBranchSelector } from "./ChatBranchSelector";
import type { Message } from "@ai-sdk/react";
import type { ProviderId } from "../../types/provider";
import type { ChatDebugEvent } from "../../types/chat-debug.js";

interface ChatInterfaceProps {
  chatProps: {
    messages: Message[];
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: () => void;
    isLoading: boolean;
    error?: string | null;
    debugEvents?: ChatDebugEvent[];
  };
  sessionId: string;
  onArtifactOpen?: (path: string, content: string) => void;
  onModelSelect?: (providerId: ProviderId, modelId: string) => void;
}

export function ChatInterface({
  chatProps,
  sessionId,
  onArtifactOpen,
  onModelSelect,
}: ChatInterfaceProps) {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    debugEvents = [],
  } = chatProps;
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
  const showDebugPanel = import.meta.env.MODE !== "production";

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

          {error && (
            <div className="px-4 py-3 rounded border border-red-500/40 bg-red-950/30 text-red-200 text-sm">
              {error}
            </div>
          )}

          {showDebugPanel && (
            <div className="rounded border border-cyan-800/60 bg-cyan-950/20">
              <div className="px-3 py-2 border-b border-cyan-800/40 text-cyan-200 text-xs font-semibold uppercase tracking-wider">
                Debug Trace (Client)
              </div>
              <div className="max-h-56 overflow-y-auto p-3 space-y-3">
                {debugEvents.length === 0 ? (
                  <div className="text-xs text-cyan-300/70">
                    Waiting for first request...
                  </div>
                ) : (
                  debugEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded border border-cyan-900/60 bg-black/50 p-2"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                          {event.phase}
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-xs text-cyan-100 mb-2">
                        {event.summary}
                      </div>
                      <pre className="text-[11px] text-zinc-200 whitespace-pre-wrap break-all overflow-x-auto">
                        {formatDebugPayload(event.payload)}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </div>
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
            sessionId={sessionId}
            onModelSelect={onModelSelect}
          />
          <div className="pl-6 mt-1">
            <ChatBranchSelector />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDebugPayload(payload: unknown): string {
  try {
    const serialized = JSON.stringify(payload, null, 2);
    if (!serialized) {
      return "(empty payload)";
    }
    if (serialized.length > 5000) {
      return `${serialized.slice(0, 5000)}\n...<truncated>`;
    }
    return serialized;
  } catch {
    return String(payload);
  }
}
