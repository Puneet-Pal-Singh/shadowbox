import { useChat as useVercelChat, type Message } from "@ai-sdk/react";
import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { chatStreamPath, getBrainHttpBase } from "../lib/platform-endpoints.js";
import { dispatchRunSummaryRefresh } from "../lib/run-summary-events.js";
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
  harnessId?: RuntimeHarnessId;
  repositoryOwner?: string;
  repositoryName?: string;
  repositoryBranch?: string;
  repositoryBaseUrl?: string;
}

type RuntimeHarnessId = "cloudflare-sandbox" | "local-sandbox";

const DEFAULT_RUNTIME_HARNESS: RuntimeHarnessId = "cloudflare-sandbox";
const RUNTIME_HARNESS_QUERY_PARAM = "harness";
const RUNTIME_HARNESS_SESSION_KEY_PREFIX = "shadowbox:runtime-harness:";

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
  const lastLoggedStreamErrorRef = useRef<{
    message: string;
    timestamp: number;
  } | null>(null);
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
    resolveForChat,
  } = useProviderStore(runId);
  const hasConnectedCredential = credentials.length > 0;
  const isModelConfigReady = status === "ready" && hasConnectedCredential;

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
      dispatchRunSummaryRefresh(runId);
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
      dispatchRunSummaryRefresh(runId);
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
      dispatchRunSummaryRefresh(runId);
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
      if (shouldLogStreamError(lastLoggedStreamErrorRef.current, message)) {
        console.error("🧬 [Shadowbox] Chat Stream Error:", message);
        lastLoggedStreamErrorRef.current = {
          message,
          timestamp: Date.now(),
        };
      }
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

      const resolvedConfig = await resolveForChat();
      const providerId = resolvedConfig.providerId;
      const modelId = resolvedConfig.modelId;
      const credentialId = resolvedConfig.credentialId;
      if (!providerId || !modelId || !credentialId) {
        throw new Error(
          "Provider resolution failed: missing explicit provider/model credential selection.",
        );
      }

      const resolvedHarnessId = resolveRuntimeHarnessId(sessionId);
      const requestBody: ChatRequestBody = {
        sessionId,
        runId,
        harnessId: resolvedHarnessId,
        providerId,
        modelId,
        ...loadRepositoryContextFields(sessionId),
      };

      pushDebugEvent({
        phase: "request",
        summary: `POST ${apiPath}`,
        payload: {
          endpoint: apiPath,
          requestBody,
          userMessage: content,
          resolvedConfig: {
            providerId,
            modelId,
            credentialId,
          },
        },
      });
      dispatchRunSummaryRefresh(runId);

      await append(
        { role: "user", content },
        {
          body: requestBody,
        },
      );
    },
    [
      append,
      resolveForChat,
      runId,
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
  const parsedPayload = parseJsonErrorPayload(rawMessage);
  const message = parsedPayload?.error?.trim() || rawMessage;
  const normalized = mapKnownChatErrorMessage(message, parsedPayload);
  return normalized ?? message;
}

interface ParsedChatErrorPayload {
  error?: string;
  code?: string;
  metadata?: {
    used?: number;
    limit?: number;
    resetsAt?: string;
  };
}

function parseJsonErrorPayload(rawMessage: string): ParsedChatErrorPayload | null {
  try {
    const parsed = JSON.parse(rawMessage) as ParsedChatErrorPayload;
    if (
      (typeof parsed?.error === "string" && parsed.error.trim().length > 0) ||
      typeof parsed?.code === "string"
    ) {
      return parsed;
    }
  } catch {
    // Not a JSON payload
  }
  return null;
}

function mapKnownChatErrorMessage(
  message: string,
  payload?: ParsedChatErrorPayload | null,
): string | null {
  if (payload?.code === "AXIS_DAILY_LIMIT_EXCEEDED") {
    const used = payload.metadata?.used;
    const limit = payload.metadata?.limit;
    const resetsAt = payload.metadata?.resetsAt;
    if (
      typeof used === "number" &&
      typeof limit === "number" &&
      typeof resetsAt === "string"
    ) {
      return `Axis free-tier limit reached (${used}/${limit}). Connect a BYOK provider or retry after ${new Date(resetsAt).toLocaleString()}.`;
    }
    return "Axis free-tier limit reached. Connect a BYOK provider or retry after reset.";
  }
  if (payload?.code === "PLAN_SCHEMA_MISMATCH") {
    return "The model could not build a valid structured plan for this request. Retry with a concrete file path or command, or switch to a stronger model.";
  }
  if (payload?.code === "PLAN_GENERATION_TIMEOUT") {
    return "Planning timed out before executable tasks were generated. Retry with a narrower request.";
  }
  if (payload?.code === "PROVIDER_UNAVAILABLE") {
    return "Provider request failed after retries. Check provider health/model availability or switch providers and retry.";
  }
  if (payload?.code === "RATE_LIMITED") {
    return "Provider rate limit reached. Retry after cooldown or switch to another connected provider.";
  }
  if (payload?.code === "AUTH_FAILED") {
    return "Provider authentication failed. Reconnect credentials in Provider Settings and retry.";
  }
  if (containsMissingDefaultKeyError(message)) {
    return "No explicit provider configuration is available. Connect a provider key in Settings. If you are in private/incognito mode, persistence may be reset.";
  }
  if (containsOpenRouterKeyLimitError(message)) {
    return "OpenRouter key limit is exhausted ($0 total limit). Increase key limit in https://openrouter.ai/settings/keys or use a different provider key.";
  }
  if (containsToolChoiceUnsupportedError(message)) {
    return "The selected model does not support required tool-calling/structured planning. Choose a different model.";
  }
  if (containsProviderRetryFailure(message)) {
    return "Provider request failed after retries. Check provider health/model availability or switch providers and retry.";
  }
  if (containsTransientNetworkError(message)) {
    return "Temporary network/service issue while streaming chat. Please retry in a few seconds.";
  }
  return null;
}

function containsMissingDefaultKeyError(message: string): boolean {
  return (
    message.includes("No default provider key is configured") ||
    message.includes("Provider resolution failed") ||
    message.includes("Missing API key for configured LITELLM_BASE_URL") ||
    message.includes("Missing AXIS_OPENROUTER_API_KEY")
  );
}

function containsOpenRouterKeyLimitError(message: string): boolean {
  return message.includes("Key limit exceeded (total limit)");
}

function containsToolChoiceUnsupportedError(message: string): boolean {
  return message.includes("support the provided 'tool_choice' value");
}

function containsTransientNetworkError(message: string): boolean {
  return (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Network connection lost") ||
    message.includes("Service Unavailable")
  );
}

function containsProviderRetryFailure(message: string): boolean {
  return (
    message.includes("Failed after 3 attempts") ||
    message.includes("Provider returned error")
  );
}

function shouldLogStreamError(
  previous: { message: string; timestamp: number } | null,
  message: string,
): boolean {
  if (!previous) {
    return true;
  }
  if (previous.message !== message) {
    return true;
  }
  return Date.now() - previous.timestamp >= 30_000;
}

function resolveRuntimeHarnessId(sessionId: string): RuntimeHarnessId {
  return (
    loadRuntimeHarnessFromSession(sessionId) ??
    loadRuntimeHarnessFromQuery() ??
    DEFAULT_RUNTIME_HARNESS
  );
}

function loadRuntimeHarnessFromSession(
  sessionId: string,
): RuntimeHarnessId | undefined {
  try {
    const storedHarness = sessionStorage.getItem(
      `${RUNTIME_HARNESS_SESSION_KEY_PREFIX}${sessionId}`,
    );
    return isRuntimeHarnessId(storedHarness) ? storedHarness : undefined;
  } catch {
    return undefined;
  }
}

function loadRuntimeHarnessFromQuery(): RuntimeHarnessId | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const queryHarness = new URLSearchParams(window.location.search).get(
    RUNTIME_HARNESS_QUERY_PARAM,
  );
  return isRuntimeHarnessId(queryHarness) ? queryHarness : undefined;
}

function isRuntimeHarnessId(value: unknown): value is RuntimeHarnessId {
  return value === "cloudflare-sandbox" || value === "local-sandbox";
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
