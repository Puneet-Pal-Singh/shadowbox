import { useChat as useVercelChat, type Message } from "@ai-sdk/react";
import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  type FormEvent,
} from "react";

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
  // Generate a new UUID v4 runId for each conversation turn
  const [runId, setRunId] = useState<string>(
    () => externalRunId || crypto.randomUUID(),
  );

  // Reset runId when session changes
  useEffect(() => {
    if (!externalRunId) {
      setRunId(crypto.randomUUID());
    }
  }, [sessionId, externalRunId]);

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
    api: "http://localhost:8788/chat",
    body: { sessionId, runId },
    initialMessages: [],
    id: instanceKey,
    onError: (error: Error) => {
      console.error("🧬 [Shadowbox] Chat Stream Error:", error.message);
    },
  });

  const resetRun = useCallback(() => {
    setRunId(crypto.randomUUID());
    setMessages([]);
  }, [setMessages]);

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
