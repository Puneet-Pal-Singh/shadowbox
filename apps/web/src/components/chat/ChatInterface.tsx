import { useRef, useEffect, useState, useMemo } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInputBar } from "./ChatInputBar";
import { ExploredFilesSummary } from "./ExploredFilesSummary";
import { ChatBranchSelector } from "./ChatBranchSelector";
import { ProviderDialog } from "../provider/ProviderDialog";
import type { Message } from "@ai-sdk/react";
import type { RunMode } from "@repo/shared-types";
import type { ProviderId } from "../../types/provider";
import type { ChatDebugEvent } from "../../types/chat-debug.js";
import { useRunSummary } from "../../hooks/useRunSummary.js";
import { getProviderRecoveryAdvice } from "../../lib/provider-recovery";
import { useProviderStore } from "../../hooks/useProviderStore.js";
import { buildChatMessageMetadata } from "./messageMetadata";

interface ChatInterfaceProps {
  chatProps: {
    messages: Message[];
    runId: string;
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: () => void;
    stop: () => void;
    isLoading: boolean;
    error?: string | null;
    debugEvents?: ChatDebugEvent[];
  };
  sessionId: string;
  mode?: RunMode;
  onModeChange?: (mode: RunMode) => void;
  onArtifactOpen?: (path: string, content: string) => void;
  onModelSelect?: (providerId: ProviderId, modelId: string) => void;
}

export function ChatInterface({
  chatProps,
  sessionId,
  mode = "build",
  onModeChange,
  onArtifactOpen,
  onModelSelect,
}: ChatInterfaceProps) {
  const {
    messages,
    runId,
    input,
    handleInputChange,
    handleSubmit,
    stop,
    isLoading,
    error,
    debugEvents = [],
  } = chatProps;
  const scrollRef = useRef<HTMLDivElement>(null);
  const thinkingStartAtRef = useRef<number | null>(null);
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      thinkingStartAtRef.current = null;
      return;
    }

    if (thinkingStartAtRef.current === null) {
      thinkingStartAtRef.current = Date.now();
    }

    const intervalId = window.setInterval(() => {
      const startedAt = thinkingStartAtRef.current;
      if (startedAt === null) {
        return;
      }
      setThinkingElapsedMs(Date.now() - startedAt);
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLoading]);

  const { summary } = useRunSummary(runId, isLoading);
  const showDebugPanel =
    import.meta.env.VITE_ENABLE_CHAT_DEBUG_PANEL === "true";
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const { providerModels } = useProviderStore(runId);

  const messageMetadataById = useMemo(() => {
    return buildChatMessageMetadata(
      messages,
      debugEvents,
      (modelId) => resolveModelLabel(modelId, providerModels),
      mode === "plan" ? "Plan" : "Build",
    );
  }, [messages, debugEvents, mode, providerModels]);

  const handleInputChangeWrapper = (value: string) => {
    // Create a synthetic event to match the expected interface
    const syntheticEvent = {
      target: { value },
    } as React.ChangeEvent<HTMLTextAreaElement>;
    handleInputChange(syntheticEvent);
  };

  const recoveryAdvice = getProviderRecoveryAdvice(error);

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Scrollable Messages Container - Centered with max-width */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {(messages.length > 0 || isLoading) && (
            <ExploredFilesSummary
              runStatus={summary?.status}
              totalTasks={summary?.totalTasks ?? 0}
              completedTasks={summary?.completedTasks ?? 0}
              failedTasks={summary?.failedTasks ?? 0}
              isLoading={isLoading}
            />
          )}

          {error && (
            <div className="px-4 py-3 rounded border border-red-500/40 bg-red-950/30 text-red-200 text-sm space-y-2">
              <p>{recoveryAdvice.message}</p>
              <p className="text-red-100/80 text-xs">{recoveryAdvice.remediation}</p>
              <button
                type="button"
                onClick={() => setShowProviderDialog(true)}
                className="text-xs px-2 py-1 rounded border border-red-300/40 hover:bg-red-900/40 transition"
              >
                {recoveryAdvice.actionLabel}
              </button>
            </div>
          )}

          {showDebugPanel && (
            <div className="rounded border border-cyan-800/60 bg-cyan-950/20">
              <div className="px-3 py-2 border-b border-cyan-800/40 text-cyan-200 text-xs font-semibold uppercase tracking-wider">
                Debug Trace (Client)
              </div>
              <div className="max-h-56 overflow-y-auto p-3 space-y-3">
                {debugEvents.length === 0 ? (
                  <div className="text-xs text-cyan-300/70">
                    Waiting for first request...
                  </div>
                ) : (
                  debugEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded border border-cyan-900/60 bg-black/50 p-2"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                          {event.phase}
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-xs text-cyan-100 mb-2">
                        {event.summary}
                      </div>
                      <pre className="text-[11px] text-zinc-200 whitespace-pre-wrap break-all overflow-x-auto">
                        {formatDebugPayload(event.payload)}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              metadata={messageMetadataById[msg.id]}
              onArtifactOpen={onArtifactOpen}
            />
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-500 font-medium bg-zinc-900/30 w-fit rounded-full border border-zinc-800/50 animate-pulse">
              <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" />
              <span>{`Thinking... ${formatThinkingDuration(thinkingElapsedMs)}`}</span>
            </div>
          )}
        </div>
      </div>

      {/* Input Area - Centered */}
      <div className="px-6 pb-4">
        <div className="max-w-4xl mx-auto">
          <ChatInputBar
            input={input}
            onChange={handleInputChangeWrapper}
            onSubmit={handleSubmit}
            onStop={stop}
            isLoading={isLoading}
            sessionId={sessionId}
            mode={mode}
            onModeChange={onModeChange}
            hasMessages={messages.length > 0}
            onModelSelect={onModelSelect}
          />
          <div className="pl-6 mt-1">
            <ChatBranchSelector />
          </div>
        </div>
      </div>
      <ProviderDialog
        isOpen={showProviderDialog}
        onClose={() => setShowProviderDialog(false)}
        mode="composer"
      />
    </div>
  );
}

function formatThinkingDuration(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDebugPayload(payload: unknown): string {
  try {
    const serialized = JSON.stringify(payload, null, 2);
    if (!serialized) {
      return "(empty payload)";
    }
    if (serialized.length > 5000) {
      return `${serialized.slice(0, 5000)}\n...<truncated>`;
    }
    return serialized;
  } catch {
    return String(payload);
  }
}

function resolveModelLabel(
  modelId: string,
  providerModels: Record<string, Array<{ id: string; name: string }>>,
): string {
  for (const models of Object.values(providerModels)) {
    const matched = models.find((model) => model.id === modelId);
    if (matched?.name) {
      return matched.name;
    }
  }
  return summarizeModelId(modelId);
}

function summarizeModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) {
    return "Unknown model";
  }
  const withoutProvider = trimmed.includes("/") ? trimmed.split("/").pop() ?? trimmed : trimmed;
  return withoutProvider.replace(/:free$/i, "").replace(/-/g, " ");
}
