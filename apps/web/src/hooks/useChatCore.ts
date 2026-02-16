import { useChat as useVercelChat, type Message } from "@ai-sdk/react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { chatStreamPath } from "../lib/platform-endpoints.js";

interface UseChatCoreResult {
  messages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e?: FormEvent) => void;
  append: (message: { role: "user"; content: string }) => void;
  isLoading: boolean;
  stop: () => void;
  setMessages: (messages: Message[]) => void;
  runId: string;
  resetRun: () => void;
}

/**
 * useChatCore
 * Minimal wrapper around Vercel AI SDK with UUID runId generation
 * Single Responsibility: Manage Vercel AI SDK integration and run lifecycle
 */
export function useChatCore(
  sessionId: string,
  externalRunId?: string,
): UseChatCoreResult {
  const [internalRunId, setInternalRunId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  const runId = externalRunId || internalRunId;

  // Stable instance key - changes when runId changes
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
    api: chatStreamPath(),
    body: { sessionId, runId },
    initialMessages: [],
    id: instanceKey,
    onError: (error: Error) => {
      console.error("🧬 [Shadowbox] Chat Stream Error:", error.message);
    },
  });

  const resetRun = useCallback(() => {
    if (!externalRunId) {
      setInternalRunId(crypto.randomUUID());
    }
    // setMessages will be called after the new instance is created via instanceKey change
  }, [externalRunId]);

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
    runId,
    resetRun,
  };
}
