import { useChat as useVercelChat, type Message } from "@ai-sdk/react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { chatStreamPath } from "../lib/platform-endpoints.js";
import { useByokStore } from "./useByokStore.js";

interface UseChatCoreResult {
  messages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e?: FormEvent) => void;
  append: (message: { role: "user"; content: string }) => Promise<void>;
  isLoading: boolean;
  stop: () => void;
  setMessages: (messages: Message[]) => void;
  runId: string;
  resetRun: () => void;
  isModelConfigReady: boolean;
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
  const { status, preferences, lastResolvedConfig, resolveForChat } =
    useByokStore();
  const isModelConfigReady = status === "ready";
  const activeProviderId =
    lastResolvedConfig?.providerId ?? preferences?.defaultProviderId;
  const activeModelId = lastResolvedConfig?.modelId ?? preferences?.defaultModelId;
  const hasCompleteOverride = Boolean(
    isModelConfigReady && activeProviderId && activeModelId,
  );

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
      ...(hasCompleteOverride
        ? {
            providerId: activeProviderId,
            modelId: activeModelId,
          }
        : {}),
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

  const appendWithResolution = useCallback(
    async (message: { role: "user"; content: string }): Promise<void> => {
      const content = message.content.trim();
      if (!content || status !== "ready") {
        throw new Error("Provider configuration is not ready.");
      }

      let resolvedConfig = lastResolvedConfig;
      if (!resolvedConfig) {
        resolvedConfig = await resolveForChat();
      }

      await append(
        { role: "user", content },
        {
          body: {
            sessionId,
            runId,
            providerId: resolvedConfig.providerId,
            modelId: resolvedConfig.modelId,
          },
        },
      );
    },
    [append, lastResolvedConfig, resolveForChat, runId, sessionId, status],
  );

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const trimmedInput = input.trim();
      if (!trimmedInput || isLoading || status !== "ready") return;

      const submitWithResolution = async (): Promise<void> => {
        try {
          await appendWithResolution({ role: "user", content: trimmedInput });
        } catch (error) {
          console.error(
            `[useChatCore] Failed to append resolved message for session ${sessionId}`,
            error,
          );
        }
      };

      void submitWithResolution();
    },
    [appendWithResolution, input, isLoading, sessionId, status],
  );

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append: appendWithResolution,
    isLoading,
    stop,
    setMessages,
    runId,
    resetRun,
    isModelConfigReady,
  };
}
