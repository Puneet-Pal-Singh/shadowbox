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
  const { status, credentials, preferences, lastResolvedConfig, resolveForChat } =
    useByokStore();
  const hasConnectedCredential = credentials.length > 0;
  // Ready for chat if store is initialized (no longer requires connected BYOK)
  const isModelConfigReady = status === "ready";
  const activeProviderId =
    lastResolvedConfig?.providerId ?? preferences?.defaultProviderId ?? "openrouter";
  const activeModelId =
    lastResolvedConfig?.modelId ?? preferences?.defaultModelId ?? "google/gemma-2-9b-it:free";
  const hasCompleteOverride = Boolean(
    status === "ready" && activeProviderId && activeModelId,
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
        throw new Error("Chat is not ready. Please try again.");
      }

      // Resolve provider/model: use lastResolvedConfig if available,
      // otherwise fallback to defaults for no-BYOK path
      let providerId = activeProviderId;
      let modelId = activeModelId;

      if (hasConnectedCredential && !lastResolvedConfig) {
        // Only call resolveForChat if BYOK is connected and we need resolution
        const resolvedConfig = await resolveForChat();
        providerId = resolvedConfig.providerId;
        modelId = resolvedConfig.modelId;
      }

      await append(
        { role: "user", content },
        {
          body: {
            sessionId,
            runId,
            providerId,
            modelId,
          },
        },
      );
    },
    [
      append,
      activeProviderId,
      activeModelId,
      hasConnectedCredential,
      lastResolvedConfig,
      resolveForChat,
      runId,
      sessionId,
      status,
    ],
  );

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const trimmedInput = input.trim();
      if (!trimmedInput || isLoading || !isModelConfigReady) return;

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
    [appendWithResolution, input, isLoading, isModelConfigReady, sessionId],
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
