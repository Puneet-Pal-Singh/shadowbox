import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInputBar } from "./ChatInputBar";
import { ChatBranchSelector } from "./ChatBranchSelector";
import { ProviderDialog } from "../provider/ProviderDialog";
import type { Message } from "@ai-sdk/react";
import type { RunMode } from "@repo/shared-types";
import type { ProviderId } from "../../types/provider";
import type { ChatDebugEvent } from "../../types/chat-debug.js";
import { useRunSummary } from "../../hooks/useRunSummary.js";
import { useRunEvents } from "../../hooks/useRunEvents.js";
import { useRunActivityFeed } from "../../hooks/useRunActivityFeed.js";
import { getProviderRecoveryAdvice } from "../../lib/provider-recovery";
import { useProviderStore } from "../../hooks/useProviderStore.js";
import {
  buildChatMessageMetadata,
  buildConversationTurns,
} from "./messageMetadata";
import { buildActivityFeedViewModel } from "../../services/activity/ActivityFeedViewModel.js";
import { ActivityTurn } from "./activity/ActivityTurn.js";
import { WorkflowTimeline } from "./workflow/WorkflowTimeline.js";
import type { ActivityTurnViewModel } from "../../services/activity/ActivityFeedViewModel.js";

// Flip to true when you want to temporarily inspect the legacy workflow debug UI.
const SHOW_WORKFLOW_DEBUG_PANEL = false;

function ChatErrorNotice({
  message,
  remediation,
  actionLabel,
  onOpenProviders,
}: {
  message: string;
  remediation: string;
  actionLabel: string;
  onOpenProviders: () => void;
}) {
  return (
    <div className="px-4 py-3 rounded border border-red-500/40 bg-red-950/30 text-red-200 text-sm space-y-2">
      <p>{message}</p>
      <p className="text-red-100/80 text-xs">{remediation}</p>
      <button
        type="button"
        onClick={onOpenProviders}
        className="text-xs px-2 py-1 rounded border border-red-300/40 hover:bg-red-900/40 transition"
      >
        {actionLabel}
      </button>
    </div>
  );
}

interface ChatInterfaceProps {
  chatProps: {
    messages: Message[];
    runId: string;
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: () => void;
    append: (message: { role: "user"; content: string }) => Promise<void>;
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
    append,
    stop,
    isLoading,
    error,
    debugEvents = [],
  } = chatProps;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pendingPlanPrompt, setPendingPlanPrompt] = useState<string | null>(
    null,
  );
  const [expandedActivityTurns, setExpandedActivityTurns] = useState<
    Record<string, boolean>
  >({});
  const [expandedActivityRows, setExpandedActivityRows] = useState<
    Record<string, boolean>
  >({});

  const { summary } = useRunSummary(runId, isLoading);
  const { events } = useRunEvents(runId, isLoading);
  const { feed } = useRunActivityFeed(runId, isLoading);
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
  const activityViewModel = useMemo(
    () => buildActivityFeedViewModel(feed),
    [feed],
  );
  const conversationTurns = useMemo(
    () => buildConversationTurns(messages),
    [messages],
  );

  useEffect(() => {
    setExpandedActivityTurns({});
    setExpandedActivityRows({});
  }, [runId]);

  const handleInputChangeWrapper = useCallback(
    (value: string) => {
      // Create a synthetic event to match the expected interface
      const syntheticEvent = {
        target: { value },
      } as React.ChangeEvent<HTMLTextAreaElement>;
      handleInputChange(syntheticEvent);
    },
    [handleInputChange],
  );

  useEffect(() => {
    if (!pendingPlanPrompt || mode !== "build" || isLoading) {
      return;
    }

    const submitPlanHandoff = async (): Promise<void> => {
      try {
        await append({ role: "user", content: pendingPlanPrompt });
      } catch (submitError) {
        console.warn(
          "[chat/interface] Failed to submit plan handoff",
          submitError,
        );
        handleInputChangeWrapper(pendingPlanPrompt);
      } finally {
        setPendingPlanPrompt(null);
      }
    };

    void submitPlanHandoff();
  }, [append, handleInputChangeWrapper, isLoading, mode, pendingPlanPrompt]);

  const handleUsePlanInBuild = () => {
    const handoffPrompt = summary?.planArtifact?.handoff?.prompt?.trim();
    if (!handoffPrompt) {
      return;
    }

    setPendingPlanPrompt(handoffPrompt);
    if (mode !== "build") {
      onModeChange?.("build");
    }
  };

  const recoveryAdvice = getProviderRecoveryAdvice(error);
  const activeInlineTurn = activityViewModel.turns.find(
    (turn) => turn.hasVisibleRows && !turn.defaultCollapsed,
  );
  const planHandoffAction =
    summary?.planArtifact?.handoff && (mode === "build" || onModeChange)
      ? handleUsePlanInBuild
      : undefined;
  const chatEntries = useMemo(
    () => buildChatEntries(conversationTurns, activityViewModel.turns),
    [activityViewModel.turns, conversationTurns],
  );
  const activityScrollSignal = useMemo(
    () =>
      activityViewModel.turns
        .map(
          (turn) =>
            `${turn.key}:${turn.rows.length}:${turn.summaryLabel}:${turn.isActiveTurn ? "active" : "idle"}`,
        )
        .join("|"),
    [activityViewModel.turns],
  );
  const renderActivityTurn = (turn: ActivityTurnViewModel) => (
    <ActivityTurn
      key={turn.key}
      turn={turn}
      expanded={expandedActivityTurns[turn.key] ?? !turn.defaultCollapsed}
      onToggleTurn={() =>
        setExpandedActivityTurns((current) => ({
          ...current,
          [turn.key]: !(current[turn.key] ?? !turn.defaultCollapsed),
        }))
      }
      expandedRows={expandedActivityRows}
      onToggleRow={(rowKey, expanded) =>
        setExpandedActivityRows((current) => ({
          ...current,
          [rowKey]: !expanded,
        }))
      }
      onUsePlanInBuild={planHandoffAction}
    />
  );

  // Auto-scroll to bottom on new messages and live activity updates.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activityScrollSignal, isLoading, messages]);

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Scrollable Messages Container - Centered with max-width */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-4xl mx-auto space-y-6">
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

          {chatEntries.map((entry) =>
            entry.kind === "message" ? (
              <ChatMessage
                key={entry.message.id}
                message={entry.message}
                metadata={messageMetadataById[entry.message.id]}
                onArtifactOpen={onArtifactOpen}
              />
            ) : (
              renderActivityTurn(entry.turn)
            ),
          )}

          {/* Loading indicator */}
          {isLoading && !activeInlineTurn && (
            <div className="px-4 py-2 text-sm font-medium text-zinc-500">
              <span className="bg-[linear-gradient(90deg,rgba(113,113,122,0.9)_0%,rgba(228,228,231,0.95)_45%,rgba(113,113,122,0.9)_100%)] bg-[length:220%_100%] bg-clip-text text-transparent animate-shimmer">
                Thinking
              </span>
            </div>
          )}

          {SHOW_WORKFLOW_DEBUG_PANEL ? (
            <details className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 px-4 py-3">
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Workflow Debug
              </summary>
              <div className="mt-4">
                <WorkflowTimeline
                  events={events}
                  summary={summary}
                  isLoading={isLoading}
                  onJumpToLatest={() => {
                    scrollRef.current?.scrollTo({
                      top: scrollRef.current.scrollHeight,
                      behavior: "smooth",
                    });
                  }}
                />
              </div>
            </details>
          ) : null}
        </div>
      </div>

      {/* Input Area - Centered */}
      <div className="px-6 pb-4">
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="mb-4">
              <ChatErrorNotice
                message={recoveryAdvice.message}
                remediation={recoveryAdvice.remediation}
                actionLabel={recoveryAdvice.actionLabel}
                onOpenProviders={() => setShowProviderDialog(true)}
              />
            </div>
          )}
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

type ChatInterfaceEntry =
  | { kind: "message"; message: Message }
  | { kind: "turn"; turn: ActivityTurnViewModel };

function buildChatEntries(
  conversationTurns: ReturnType<typeof buildConversationTurns>,
  turns: ActivityTurnViewModel[],
): ChatInterfaceEntry[] {
  const entries: ChatInterfaceEntry[] = [];
  const activityTurnsByMessageId = correlateActivityTurnsToMessages(
    conversationTurns,
    turns,
  );

  for (const conversationTurn of conversationTurns) {
    if (conversationTurn.userMessage) {
      entries.push({
        kind: "message",
        message: conversationTurn.userMessage,
      });

      const matchedActivityTurns =
        activityTurnsByMessageId.get(conversationTurn.userMessage.id) ?? [];
      for (const activityTurn of matchedActivityTurns) {
        if (activityTurn.hasVisibleRows) {
          entries.push({ kind: "turn", turn: activityTurn });
        }
      }
    }

    if (conversationTurn.assistantMessage) {
      entries.push({
        kind: "message",
        message: conversationTurn.assistantMessage,
      });
    }
  }

  return entries;
}

function correlateActivityTurnsToMessages(
  conversationTurns: ReturnType<typeof buildConversationTurns>,
  turns: ActivityTurnViewModel[],
): Map<string, ActivityTurnViewModel[]> {
  const assignments = new Map<string, ActivityTurnViewModel[]>();
  const conversationUserTurns = conversationTurns.filter(
    (
      turn,
    ): turn is ReturnType<typeof buildConversationTurns>[number] & {
      userMessage: Message;
    } => Boolean(turn.userMessage),
  );
  const availableConversationTurnIndexes = new Set(
    conversationUserTurns.map((_, index) => index),
  );

  for (let activityIndex = turns.length - 1; activityIndex >= 0; activityIndex -= 1) {
    const activityTurn = turns[activityIndex];
    if (!activityTurn?.hasVisibleRows) {
      continue;
    }

    const matchedIndex =
      findMatchingConversationTurnIndex(
        conversationUserTurns,
        availableConversationTurnIndexes,
        activityTurn.userPrompt,
      ) ??
      findLatestAvailableConversationTurnIndex(availableConversationTurnIndexes);
    if (matchedIndex === null) {
      console.warn(
        "[chat/transcript] Activity turn could not be correlated to a user message.",
        { activityTurnKey: activityTurn.key },
      );
      continue;
    }

    const matchedConversationTurn = conversationUserTurns[matchedIndex];
    if (!matchedConversationTurn) {
      console.warn(
        "[chat/transcript] Activity turn matched an unavailable user message index.",
        { activityTurnKey: activityTurn.key, matchedIndex },
      );
      availableConversationTurnIndexes.delete(matchedIndex);
      continue;
    }

    availableConversationTurnIndexes.delete(matchedIndex);
    const existingAssignments =
      assignments.get(matchedConversationTurn.userMessage.id) ?? [];
    existingAssignments.unshift(activityTurn);
    assignments.set(matchedConversationTurn.userMessage.id, existingAssignments);
  }

  return assignments;
}

function findMatchingConversationTurnIndex(
  conversationTurns: Array<
    ReturnType<typeof buildConversationTurns>[number] & { userMessage: Message }
  >,
  availableConversationTurnIndexes: Set<number>,
  userPrompt: string | null,
): number | null {
  const normalizedUserPrompt = normalizePromptForMatching(userPrompt);
  if (!normalizedUserPrompt) {
    return null;
  }

  for (let index = conversationTurns.length - 1; index >= 0; index -= 1) {
    if (!availableConversationTurnIndexes.has(index)) {
      continue;
    }
    const conversationPrompt = normalizePromptForMatching(
      conversationTurns[index]?.userMessage.content,
    );
    if (conversationPrompt === normalizedUserPrompt) {
      return index;
    }
  }

  return null;
}

function findLatestAvailableConversationTurnIndex(
  availableConversationTurnIndexes: Set<number>,
): number | null {
  const indexes = Array.from(availableConversationTurnIndexes);
  if (indexes.length === 0) {
    return null;
  }

  return Math.max(...indexes);
}

function normalizePromptForMatching(content: string | null | undefined): string {
  if (typeof content !== "string") {
    return "";
  }

  return content.trim();
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
  const withoutProvider = trimmed.includes("/")
    ? (trimmed.split("/").pop() ?? trimmed)
    : trimmed;
  return withoutProvider.replace(/:free$/i, "").replace(/-/g, " ");
}
