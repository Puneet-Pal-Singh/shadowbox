import { useChat as useVercelChat, type Message } from "@ai-sdk/react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { DEFAULT_PLATFORM_MODEL_ID } from "@repo/shared-types";
import { chatStreamPath, getBrainHttpBase } from "../lib/platform-endpoints.js";
import { useProviderStore } from "./useProviderStore.js";
import type { ChatDebugEvent } from "../types/chat-debug.js";
import { SessionStateService } from "../services/SessionStateService";

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

interface ChatRequestBody {
  sessionId: string;
  runId: string;
  providerId?: string;
  modelId?: string;
  harnessId?: "cloudflare-sandbox" | "local-sandbox";
  repositoryOwner?: string;
  repositoryName?: string;
  repositoryBranch?: string;
  repositoryBaseUrl?: string;
}

const DEFAULT_RUNTIME_HARNESS: "cloudflare-sandbox" = "cloudflare-sandbox";

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
  } = useProviderStore(runId);
  const hasConnectedCredential = credentials.length > 0;
  // Ready for chat if store is initialized (no longer requires connected provider credentials)
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
    stop: stopStream,
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
        throw new Error(
          "Chat is still initializing model settings. Wait a moment, then try again. If this continues, open Settings and reconnect a provider key.",
        );
      }
      setError(null);

      // Resolve provider/model: use lastResolvedConfig if available,
      // otherwise fallback to defaults for no-provider-credential path
      let providerId = activeProviderId;
      let modelId = activeModelId;
      let credentialId = selectedCredentialId;

      if (hasConnectedCredential && (!lastResolvedConfig || !selectedCredentialId)) {
        // Resolve when provider credentials are connected and selection is incomplete
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
      const requestBody: ChatRequestBody = {
        sessionId,
        runId,
        harnessId: DEFAULT_RUNTIME_HARNESS,
        ...loadRepositoryContextFields(sessionId),
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
      const originalInput = input;
      const trimmedInput = input.trim();
      if (!trimmedInput || isLoading || !isModelConfigReady) return;
      const clearedInputEvent = {
        target: { value: "" },
      } as React.ChangeEvent<HTMLTextAreaElement>;
      handleInputChange(clearedInputEvent);

      const submitWithResolution = async (): Promise<void> => {
        try {
          await appendWithResolution({ role: "user", content: trimmedInput });
        } catch (error) {
          const restoreInputEvent = {
            target: { value: originalInput },
          } as React.ChangeEvent<HTMLTextAreaElement>;
          handleInputChange(restoreInputEvent);
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
      handleInputChange,
      input,
      isLoading,
      isModelConfigReady,
      sessionId,
      pushDebugEvent,
    ],
  );

  const stop = useCallback(() => {
    stopStream();

    const cancelRun = async (): Promise<void> => {
      try {
        await fetch(`${getBrainHttpBase()}/api/run/cancel`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ runId }),
        });
      } catch (error) {
        console.warn("[chat/stop] Failed to cancel run", { runId, error });
      }
    };

    void cancelRun();
  }, [runId, stopStream]);

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
  const parsedMessage = parseJsonErrorMessage(rawMessage);
  const message = parsedMessage ?? rawMessage;
  const normalized = mapKnownChatErrorMessage(message);
  return normalized ?? message;
}

function parseJsonErrorMessage(rawMessage: string): string | null {
  try {
    const parsed = JSON.parse(rawMessage) as { error?: string };
    if (typeof parsed?.error === "string" && parsed.error.trim().length > 0) {
      return parsed.error.trim();
    }
  } catch {
    // Not a JSON payload
  }
  return null;
}

function mapKnownChatErrorMessage(message: string): string | null {
  if (containsMissingDefaultKeyError(message)) {
    return "No default provider key is configured. Connect a provider key in Settings or set OPENROUTER_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY for local fallback.";
  }
  if (containsOpenRouterKeyLimitError(message)) {
    return "OpenRouter key limit is exhausted ($0 total limit). Increase key limit in https://openrouter.ai/settings/keys or use a different provider key.";
  }
  if (containsToolChoiceUnsupportedError(message)) {
    return "The selected default model does not support required tool-calling/structured planning. Choose another model or disable OpenRouter routing constraints.";
  }
  return null;
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

function loadRepositoryContextFields(
  sessionId: string,
): Pick<
  ChatRequestBody,
  "repositoryOwner" | "repositoryName" | "repositoryBranch" | "repositoryBaseUrl"
> {
  const context = SessionStateService.loadSessionGitHubContext(sessionId);
  if (!context) {
    return {};
  }

  const owner =
    typeof context.repoOwner === "string" ? context.repoOwner.trim() : "";
  const name =
    typeof context.repoName === "string" ? context.repoName.trim() : "";
  const branch =
    typeof context.branch === "string" ? context.branch.trim() : "";
  const fullName =
    typeof context.fullName === "string" ? context.fullName.trim() : "";

  if (!owner || !name) {
    return {};
  }

  return {
    repositoryOwner: owner,
    repositoryName: name,
    repositoryBranch: branch || undefined,
    repositoryBaseUrl: fullName
      ? `https://github.com/${fullName}`
      : undefined,
  };
}
