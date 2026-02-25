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
  error: string | null;
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
  const [error, setError] = useState<string | null>(null);
  const runId = externalRunId || internalRunId;

  // Stable instance key - changes when runId changes
  const instanceKey = useMemo(() => `chat-${runId}`, [runId]);
  const {
    status,
    credentials,
    preferences,
    selectedProviderId,
    selectedCredentialId,
    selectedModelId,
    lastResolvedConfig,
    resolveForChat,
  } = useByokStore();
  const hasConnectedCredential = credentials.length > 0;
  // Ready for chat if store is initialized (no longer requires connected BYOK)
  const isModelConfigReady = status === "ready";
  const activeProviderId =
    selectedProviderId ??
    (hasConnectedCredential ? lastResolvedConfig?.providerId : undefined);
  const activeModelId =
    selectedModelId ??
    (hasConnectedCredential ? lastResolvedConfig?.modelId : undefined) ??
    (hasConnectedCredential ? preferences?.defaultModelId : undefined) ??
    "google/gemma-2-9b-it:free";

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
    },
    initialMessages: [],
    id: instanceKey,
    onError: (error: Error) => {
      const message = normalizeChatErrorMessage(error);
      setError(message);
      console.error("🧬 [Shadowbox] Chat Stream Error:", message);
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
      setError(null);

      // Resolve provider/model: use lastResolvedConfig if available,
      // otherwise fallback to defaults for no-BYOK path
      let providerId = activeProviderId;
      let modelId = activeModelId;
      let credentialId = selectedCredentialId;

      if (hasConnectedCredential && (!lastResolvedConfig || !selectedCredentialId)) {
        // Resolve when BYOK is connected and selection is incomplete
        const resolvedConfig = await resolveForChat();
        if (resolvedConfig.credentialId.trim().length > 0) {
          credentialId = resolvedConfig.credentialId;
          providerId = resolvedConfig.providerId;
        } else {
          credentialId = null;
          providerId = undefined;
        }
        modelId = resolvedConfig.modelId;
      }

      const includeOverride = Boolean(
        hasConnectedCredential && credentialId && providerId && modelId,
      );

      await append(
        { role: "user", content },
        {
          body: {
            sessionId,
            runId,
            ...(includeOverride
              ? {
                  providerId,
                  modelId,
                }
              : {}),
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
      selectedCredentialId,
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
          const message =
            error instanceof Error
              ? normalizeChatErrorMessage(error)
              : "Failed to send message.";
          setError(message);
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
    error,
  };
}

function normalizeChatErrorMessage(error: Error): string {
  const rawMessage = error.message || "Unknown chat error";
  try {
    const parsed = JSON.parse(rawMessage) as { error?: string };
    if (parsed?.error) {
      if (containsMissingDefaultKeyError(parsed.error)) {
        return "No default provider key is configured. Connect a BYOK provider in Settings or set OPENROUTER_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY for local fallback.";
      }
      return parsed.error;
    }
  } catch {
    // Not JSON payload
  }

  if (containsMissingDefaultKeyError(rawMessage)) {
    return "No default provider key is configured. Connect a BYOK provider in Settings or set OPENROUTER_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY for local fallback.";
  }
  return rawMessage;
}

function containsMissingDefaultKeyError(message: string): boolean {
  return (
    message.includes("Missing GROQ_API_KEY or OPENAI_API_KEY") ||
    message.includes(
      "Missing GROQ_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY",
    ) ||
    message.includes("No default provider key is configured")
  );
}
