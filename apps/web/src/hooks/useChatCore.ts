import { useChat as useVercelChat, type Message } from "@ai-sdk/react";
import { useCallback, useMemo, type FormEvent } from "react";

interface UseChatCoreResult {
  messages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e?: FormEvent) => void;
  append: (message: { role: "user"; content: string }) => void;
  isLoading: boolean;
  stop: () => void;
  setMessages: (messages: Message[]) => void;
}

/**
 * useChatCore
 * Minimal wrapper around Vercel AI SDK
 * Single Responsibility: Only manage Vercel AI SDK integration
 */
export function useChatCore(
  sessionId: string,
  runId: string,
): UseChatCoreResult {
  // Stable instance key - only changes when runId changes
  const instanceKey = useMemo(() => `chat-${runId}`, [runId]);

  const {
    messages,
    input,
    handleInputChange,
    isLoading,
    stop,
    setMessages,
    append,
  } = useVercelChat({
    api: "http://localhost:8788/chat",
    body: { sessionId, runId },
    initialMessages: [],
    id: instanceKey,
    onError: (error: Error) => {
      console.error("🧬 [Shadowbox] Chat Stream Error:", error.message);
    },
  });

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const trimmedInput = input.trim();
      if (!trimmedInput || isLoading) return;
      append({ role: "user", content: trimmedInput });
    },
    [input, isLoading, append],
  );

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    isLoading,
    stop,
    setMessages,
  };
}
