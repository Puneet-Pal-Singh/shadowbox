import { useChat as useVercelChat, type Message } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { chatStreamPath } from "../lib/platform-endpoints.js";
import { providerService } from "../services/ProviderService";

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
 * Now includes provider/model selection from session state (reactive)
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

  // Track session model config reactively with state to update when storage changes
  const [sessionModelConfig, setSessionModelConfig] = useState(() =>
    providerService.getSessionModelConfig(sessionId),
  );

  // Subscribe to config changes when sessionId changes
  useEffect(() => {
    // Subscribe to config changes for this session
    const unsubscribe = providerService.subscribeToSessionConfig(
      sessionId,
      (config) => {
        // Only update if config actually changed (prevent cascading renders)
        setSessionModelConfig((prev) => {
          if (
            prev.providerId === config.providerId &&
            prev.modelId === config.modelId
          ) {
            return prev;
          }
          return config;
        });
      },
    );

    // Cleanup subscription when sessionId changes or component unmounts
    return unsubscribe;
  }, [sessionId]);

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
    body: {
      sessionId,
      runId,
      ...(sessionModelConfig.providerId && {
        providerId: sessionModelConfig.providerId,
      }),
      ...(sessionModelConfig.modelId && {
        modelId: sessionModelConfig.modelId,
      }),
    },
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
