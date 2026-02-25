import { useChat as useVercelChat, type Message } from "@ai-sdk/react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { DEFAULT_PLATFORM_MODEL_ID } from "@repo/shared-types";
import { chatStreamPath } from "../lib/platform-endpoints.js";
import { useByokStore } from "./useByokStore.js";
import type { ChatDebugEvent } from "../types/chat-debug.js";

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
  debugEvents: ChatDebugEvent[];
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
  const [debugEvents, setDebugEvents] = useState<ChatDebugEvent[]>([]);
  const runId = externalRunId || internalRunId;
  const apiPath = chatStreamPath();

  const pushDebugEvent = useCallback(
    (event: Omit<ChatDebugEvent, "id" | "timestamp">) => {
      setDebugEvents((previous) => [
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          ...event,
        },
        ...previous,
      ].slice(0, 50));
    },
    [],
  );

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
  } = useByokStore(runId);
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
    DEFAULT_PLATFORM_MODEL_ID;

  const {
    messages,
    input,
    handleInputChange,
    isLoading,
    stop,
    setMessages,
    append,
  } = useVercelChat({
    api: apiPath,
    streamProtocol: "text",
    body: {
      sessionId,
      runId,
    },
    initialMessages: [],
    id: instanceKey,
    onResponse: (response: Response) => {
      pushDebugEvent({
        phase: "response",
        summary: `HTTP ${response.status} ${response.statusText}`,
        payload: {
          status: response.status,
          statusText: response.statusText,
          headers: pickDebugHeaders(response.headers),
        },
      });
    },
    onFinish: (message, details) => {
      pushDebugEvent({
        phase: "finish",
        summary: "Stream finished",
        payload: {
          assistantMessage: message.content,
          finishDetails: details,
        },
      });
    },
    onError: (error: Error) => {
      const message = normalizeChatErrorMessage(error);
      setError(message);
      pushDebugEvent({
        phase: "error",
        summary: message,
        payload: {
          rawError: error.message,
          normalizedError: message,
        },
      });
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
      const requestBody: {
        sessionId: string;
        runId: string;
        providerId?: string;
        modelId?: string;
      } = {
        sessionId,
        runId,
      };
      if (includeOverride) {
        requestBody.providerId = providerId;
        requestBody.modelId = modelId;
      }

      pushDebugEvent({
        phase: "request",
        summary: `POST ${apiPath}`,
        payload: {
          endpoint: apiPath,
          requestBody,
          userMessage: content,
          includeOverride,
          resolvedConfig: {
            providerId: providerId ?? null,
            modelId: modelId ?? null,
            credentialId: credentialId ?? null,
          },
        },
      });

      await append(
        { role: "user", content },
        {
          body: requestBody,
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
      pushDebugEvent,
      apiPath,
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
          pushDebugEvent({
            phase: "error",
            summary: message,
            payload: {
              source: "appendWithResolution",
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown append error",
            },
          });
          console.error(
            `[useChatCore] Failed to append resolved message for session ${sessionId}`,
            error,
          );
        }
      };

      void submitWithResolution();
    },
    [
      appendWithResolution,
      input,
      isLoading,
      isModelConfigReady,
      sessionId,
      pushDebugEvent,
    ],
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
    debugEvents,
  };
}

function pickDebugHeaders(headers: Headers): Record<string, string> {
  const allowedHeaders = new Set([
    "content-type",
    "transfer-encoding",
    "x-request-id",
    "x-vercel-ai-data-stream",
    "x-ai-sdk-data-stream",
    "cache-control",
  ]);
  const picked: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    if (allowedHeaders.has(key.toLowerCase())) {
      picked[key] = value;
    }
  }
  return picked;
}

function normalizeChatErrorMessage(error: Error): string {
  const rawMessage = error.message || "Unknown chat error";
  try {
    const parsed = JSON.parse(rawMessage) as { error?: string };
    if (parsed?.error) {
      if (containsMissingDefaultKeyError(parsed.error)) {
        return "No default provider key is configured. Connect a BYOK provider in Settings or set OPENROUTER_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY for local fallback.";
      }
      if (containsOpenRouterKeyLimitError(parsed.error)) {
        return "OpenRouter key limit is exhausted ($0 total limit). Increase key limit in https://openrouter.ai/settings/keys or use a BYOK provider key.";
      }
      if (containsToolChoiceUnsupportedError(parsed.error)) {
        return "The selected default model does not support required tool-calling/structured planning. Choose another model or disable OpenRouter routing constraints.";
      }
      return parsed.error;
    }
  } catch {
    // Not JSON payload
  }

  if (containsMissingDefaultKeyError(rawMessage)) {
    return "No default provider key is configured. Connect a BYOK provider in Settings or set OPENROUTER_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY for local fallback.";
  }
  if (containsOpenRouterKeyLimitError(rawMessage)) {
    return "OpenRouter key limit is exhausted ($0 total limit). Increase key limit in https://openrouter.ai/settings/keys or use a BYOK provider key.";
  }
  if (containsToolChoiceUnsupportedError(rawMessage)) {
    return "The selected default model does not support required tool-calling/structured planning. Choose another model or disable OpenRouter routing constraints.";
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

function containsOpenRouterKeyLimitError(message: string): boolean {
  return message.includes("Key limit exceeded (total limit)");
}

function containsToolChoiceUnsupportedError(message: string): boolean {
  return message.includes("support the provided 'tool_choice' value");
}
