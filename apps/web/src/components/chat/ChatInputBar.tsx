import { useRef, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  ArrowUp,
  Square,
  X,
  FileText,
  Folder,
  FileCode2,
  Info,
  TerminalSquare,
} from "lucide-react";
import {
  DEFAULT_RUN_MODE,
  type ProviderId,
  type RunMode,
} from "@repo/shared-types";
import { useProviderStore } from "../../hooks/useProviderStore.js";
import { findCredentialByProviderId } from "../../lib/provider-helpers.js";
import { ProviderDialog, ModelPickerPopover } from "../provider/index.js";
import { useGitHubTree } from "../layout/workspace/useGitHubTree.js";
import { ChatModeToggle } from "./ChatModeToggle.js";
import {
  applyFileMention,
  filterFileMentionCandidates,
  findActiveFileMention,
} from "./fileMentions";

const IDLE_SWITCH_WARNING =
  "Changing models mid-conversation will degrade performance.";
const WARNING_AUTO_DISMISS_MS = 4000;
const BUILD_PLACEHOLDER =
  "Ask Shadowbox anything, @ to add files, / for commands";
const PLAN_PLACEHOLDER =
  "Inspect the codebase and outline a safe plan without executing changes";

interface ChatInputBarProps {
  input: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  sessionId: string;
  mode?: RunMode;
  onModeChange?: (mode: RunMode) => void;
  hasMessages?: boolean;
  onModelSelect?: (providerId: ProviderId, modelId: string) => void;
}

export function ChatInputBar({
  input,
  onChange,
  onSubmit,
  onStop,
  isLoading = false,
  placeholder,
  sessionId,
  mode = DEFAULT_RUN_MODE,
  onModeChange,
  hasMessages = false,
  onModelSelect,
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [highlightedFileIndex, setHighlightedFileIndex] = useState(0);
  const [idleSwitchWarning, setIdleSwitchWarning] = useState(false);
  const [idleSwitchWarningTick, setIdleSwitchWarningTick] = useState(0);
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | null>(
    null,
  );
  const [mentionNavigationKey, setMentionNavigationKey] = useState<string | null>(
    null,
  );
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [providerDialogInitialTab, setProviderDialogInitialTab] = useState<
    "connected" | "available" | "preferences" | "session" | undefined
  >(undefined);
  const [providerDialogInitialView, setProviderDialogInitialView] = useState<
    "default" | "manage-models"
  >("default");
  const [providerDialogVariant, setProviderDialogVariant] = useState<
    "full" | "connect-only" | "manage-models-only"
  >("full");
  const {
    catalog,
    credentials,
    status,
    selectedProviderId,
    selectedModelId,
    axisQuota,
    selectedModelView,
    lastResolvedConfig,
    providerModels,
    providerModelsMetadata,
    providerModelsPage,
    visibleModelIds,
    loadingModelsForProviderId,
    refreshingModelsForProviderId,
    loadProviderModels,
    loadMoreProviderModels,
    refreshProviderModels,
    setModelView,
    applySessionSelection,
  } = useProviderStore();
  const { repoTree, isLoadingTree } = useGitHubTree();

  const hasInput = input.trim().length > 0;
  const effectivePlaceholder =
    placeholder ?? (mode === "plan" ? PLAN_PLACEHOLDER : BUILD_PLACEHOLDER);
  const suggestionEntries = useMemo(
    () =>
      repoTree.map((entry) => ({
        path: entry.path,
        type: entry.type,
      })),
    [repoTree],
  );
  const activeMention = useMemo(
    () => findActiveFileMention(input, cursorPosition),
    [cursorPosition, input],
  );
  const activeMentionKey = activeMention
    ? `${activeMention.start}:${activeMention.end}:${activeMention.query}`
    : null;
  const filePickerListId = `chat-input-file-picker-${sessionId}`;
  const suggestedFiles = useMemo(
    () =>
      activeMention
        ? filterFileMentionCandidates(
            suggestionEntries.map((entry) => entry.path),
            activeMention.query,
          )
        : [],
    [activeMention, suggestionEntries],
  );
  const suggestedEntries = useMemo(
    () =>
      suggestedFiles
        .map((path) => suggestionEntries.find((entry) => entry.path === path))
        .filter((entry): entry is { path: string; type: string } => entry !== undefined),
    [suggestedFiles, suggestionEntries],
  );
  const shouldShowFilePicker =
    activeMention !== null && dismissedMentionKey !== activeMentionKey;
  const highlightedSuggestionIndex =
    suggestedEntries.length === 0
      ? 0
      : Math.min(
          mentionNavigationKey === activeMentionKey ? highlightedFileIndex : 0,
          suggestedEntries.length - 1,
        );
  const activeSuggestionId =
    shouldShowFilePicker && suggestedEntries[highlightedSuggestionIndex]
      ? `${filePickerListId}-option-${highlightedSuggestionIndex}`
      : undefined;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const maxHeight = hasInput ? 200 : 400;
      const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
      textareaRef.current.style.height = newHeight + "px";
    }
  }, [input, hasInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldShowFilePicker) {
      if (e.key === "ArrowDown" && suggestedFiles.length > 0) {
        e.preventDefault();
        setMentionNavigationKey(activeMentionKey);
        setHighlightedFileIndex((current) =>
          current >= suggestedFiles.length - 1 ? 0 : current + 1,
        );
        return;
      }

      if (e.key === "ArrowUp" && suggestedFiles.length > 0) {
        e.preventDefault();
        setMentionNavigationKey(activeMentionKey);
        setHighlightedFileIndex((current) =>
          current <= 0 ? suggestedFiles.length - 1 : current - 1,
        );
        return;
      }

      if (
        (e.key === "Enter" || e.key === "Tab") &&
        suggestedFiles.length > 0 &&
        !e.shiftKey
      ) {
        e.preventDefault();
        const selectedPath =
          suggestedFiles[highlightedSuggestionIndex] ?? suggestedFiles[0];
        if (selectedPath) {
          selectSuggestedFile(selectedPath);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setDismissedMentionKey(activeMentionKey);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isLoading) {
        return;
      }
      onSubmit();
    }
  };

  useEffect(() => {
    if (!onModelSelect || !lastResolvedConfig) {
      return;
    }
    onModelSelect(lastResolvedConfig.providerId, lastResolvedConfig.modelId);
  }, [lastResolvedConfig, onModelSelect]);

  useEffect(() => {
    if (!selectedProviderId || providerModels[selectedProviderId]) {
      return;
    }
    void loadProviderModels(selectedProviderId, {
      view: selectedModelView,
      append: false,
    });
  }, [
    loadProviderModels,
    providerModels,
    selectedModelView,
    selectedProviderId,
  ]);

  useEffect(() => {
    if (!idleSwitchWarning) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIdleSwitchWarning(false);
    }, WARNING_AUTO_DISMISS_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [idleSwitchWarning, idleSwitchWarningTick]);

  const selectSuggestedFile = (filePath: string) => {
    if (!activeMention) {
      return;
    }

    const { nextValue, nextCaret } = applyFileMention(input, activeMention, filePath);
    onChange(nextValue);
    setDismissedMentionKey(null);
    setMentionNavigationKey(null);
    setCursorPosition(nextCaret);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const insertMentionTrigger = () => {
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? input.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const previousCharacter = input[selectionStart - 1];
    const mentionTrigger =
      previousCharacter && !/\s/.test(previousCharacter) ? " @" : "@";
    const nextValue =
      input.slice(0, selectionStart) + mentionTrigger + input.slice(selectionEnd);

    onChange(nextValue);
    setDismissedMentionKey(null);
    setMentionNavigationKey(null);
    const nextCaret = selectionStart + mentionTrigger.length;
    setCursorPosition(nextCaret);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const syncCursorPosition = () => {
    setCursorPosition(textareaRef.current?.selectionStart ?? input.length);
  };

  return (
    <>
      {idleSwitchWarning ? (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="fixed left-1/2 top-4 z-[90] -translate-x-1/2 px-4"
          aria-live="polite"
          aria-atomic="true"
        >
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900/95 px-4 py-2 text-sm text-zinc-100 shadow-2xl backdrop-blur-sm"
          >
            <span>{IDLE_SWITCH_WARNING}</span>
            <button
              type="button"
              onClick={() => setIdleSwitchWarning(false)}
              className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Dismiss model switch warning"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="relative w-full max-w-4xl mx-auto px-4 pb-3"
      >
        {shouldShowFilePicker ? (
          <div className="absolute inset-x-5 bottom-full z-30 mb-2 overflow-hidden rounded-[1.05rem] border border-zinc-800 bg-[#171717] shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
            <div
              id={filePickerListId}
              role="listbox"
              aria-label="Repository files"
              className="max-h-[19rem] overflow-y-auto p-2"
            >
              {isLoadingTree ? (
                <div className="px-3 py-4 text-[11px] text-zinc-500">
                  Loading repository files...
                </div>
              ) : suggestedEntries.length === 0 ? (
                <div className="px-3 py-4 text-[11px] text-zinc-500">
                  No files match <span className="font-medium text-zinc-200">@{activeMention?.query ?? ""}</span>
                </div>
              ) : (
                suggestedEntries.map((entry, index) => {
                  const lastSlashIndex = entry.path.lastIndexOf("/");
                  const directory =
                    lastSlashIndex >= 0 ? entry.path.slice(0, lastSlashIndex) : "";
                  const Icon = getSuggestionIcon(entry.path, entry.type);

                  return (
                    <button
                      key={entry.path}
                      id={`${filePickerListId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === highlightedSuggestionIndex}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectSuggestedFile(entry.path);
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
                        index === highlightedSuggestionIndex
                          ? "bg-[#2b2b2d] text-white"
                          : "text-zinc-300 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                        <Icon
                          size={15}
                          strokeWidth={1.9}
                          className={getSuggestionIconClass(entry.path, entry.type)}
                        />
                      </div>
                      <div className="min-w-0 flex items-baseline gap-1 overflow-hidden">
                        <span className="truncate text-[13px] font-medium text-zinc-100">
                          {entry.path}
                        </span>
                        {directory ? (
                          <span className="truncate text-[11px] text-zinc-600">
                            {directory}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        <div
          className={`
            bg-[#171717] rounded-xl p-3
            transition-all duration-200
            ${isFocused ? "shadow-lg shadow-black/20" : ""}
          `}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              onChange(e.target.value);
              setCursorPosition(e.target.selectionStart ?? e.target.value.length);
              setDismissedMentionKey(null);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onClick={syncCursorPosition}
            onKeyUp={syncCursorPosition}
            onSelect={syncCursorPosition}
            aria-autocomplete="list"
            aria-controls={shouldShowFilePicker ? filePickerListId : undefined}
            aria-expanded={shouldShowFilePicker}
            aria-activedescendant={activeSuggestionId}
            placeholder={effectivePlaceholder}
            rows={1}
            className={`w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none resize-none overflow-hidden min-h-[20px] ${hasInput ? "max-h-[200px]" : "max-h-[400px]"}`}
            style={{ lineHeight: "1.5" }}
          />

          {mode === "plan" ? (
            <div className="mt-3 rounded-xl border border-cyan-900/60 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">
              <div className="font-semibold uppercase tracking-[0.18em] text-cyan-300">
                Plan Mode
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Plan mode inspects and outlines steps without running normal
                  mutating execution.
                </span>
                {onModeChange ? (
                  <button
                    type="button"
                    onClick={() => onModeChange("build")}
                    className="rounded-full border border-cyan-700/70 px-2.5 py-1 font-medium text-cyan-100 transition hover:border-cyan-500 hover:bg-cyan-900/40"
                  >
                    Switch to Build
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Toolbar */}
          <div className="flex items-center justify-between mt-2 pt-2">
            {/* Left: Add button + Model picker */}
            <div className="flex items-center gap-1.5">
              <ChatModeToggle
                mode={mode}
                onModeChange={(nextMode) => onModeChange?.(nextMode)}
                disabled={isLoading}
              />

              <div className="h-3.5 w-px bg-zinc-800" />

              <motion.button
                type="button"
                onClick={insertMentionTrigger}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Add files"
              >
                <Plus size={16} />
              </motion.button>

              <div className="h-3.5 w-px bg-zinc-800" />

              <ModelPickerPopover
                catalog={catalog}
                credentials={credentials}
                providerModels={providerModels}
                visibleModelIds={visibleModelIds}
                selectedProviderId={selectedProviderId}
                selectedModelId={selectedModelId}
                selectedModelView={selectedModelView}
                selectedProviderMetadata={
                  selectedProviderId
                    ? (providerModelsMetadata[selectedProviderId] ?? null)
                    : null
                }
                hasMoreSelectedProviderModels={
                  selectedProviderId
                    ? (providerModelsPage[selectedProviderId]?.hasMore ?? false)
                    : false
                }
                isLoadingMoreSelectedProviderModels={
                  selectedProviderId !== null &&
                  loadingModelsForProviderId === selectedProviderId
                }
                isRefreshingSelectedProviderModels={
                  selectedProviderId !== null &&
                  refreshingModelsForProviderId === selectedProviderId
                }
                onSelectModel={async (providerId, modelId) => {
                  const credential = findCredentialByProviderId(
                    credentials,
                    providerId,
                  );
                  if (!credential) {
                    setProviderDialogInitialTab("available");
                    setProviderDialogInitialView("default");
                    setProviderDialogVariant("connect-only");
                    setShowProviderDialog(true);
                    return;
                  }
                  await applySessionSelection({
                    providerId,
                    credentialId: credential.credentialId,
                    modelId,
                  });
                  if (hasMessages && !isLoading) {
                    setIdleSwitchWarning(true);
                    setIdleSwitchWarningTick((value) => value + 1);
                  }
                }}
                onSelectModelView={setModelView}
                onLoadMoreSelectedProviderModels={loadMoreProviderModels}
                onRefreshSelectedProviderModels={refreshProviderModels}
                onConnectProvider={() => {
                  setProviderDialogInitialTab("available");
                  setProviderDialogInitialView("default");
                  setProviderDialogVariant("connect-only");
                  setShowProviderDialog(true);
                }}
                onManageModels={() => {
                  setProviderDialogInitialTab("connected");
                  setProviderDialogInitialView("manage-models");
                  setProviderDialogVariant("manage-models-only");
                  setShowProviderDialog(true);
                }}
                isLoading={status === "loading"}
              />

              {selectedProviderId === "axis" && axisQuota ? (
                <span
                  className="rounded border border-emerald-800/60 bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
                  title={`Axis daily usage resets at ${new Date(axisQuota.resetsAt).toLocaleString()}`}
                >
                  Axis {axisQuota.used}/{axisQuota.limit}
                </span>
              ) : null}
            </div>

            {/* Attachment and voice actions stay hidden until they trigger real flows. */}
            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
                onClick={isLoading ? onStop : onSubmit}
                disabled={isLoading ? !onStop : !input.trim()}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`
                  p-1.5 rounded-full transition-all
                  ${
                    isLoading
                      ? "bg-white text-black hover:bg-zinc-200"
                      : input.trim()
                        ? "bg-white text-black hover:bg-zinc-200"
                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                  }
                `}
              >
                {isLoading ? <Square size={14} /> : <ArrowUp size={16} />}
              </motion.button>
            </div>
          </div>
        </div>
      </form>
      <ProviderDialog
        isOpen={showProviderDialog}
        onClose={() => {
          setShowProviderDialog(false);
          setProviderDialogInitialTab(undefined);
          setProviderDialogInitialView("default");
          setProviderDialogVariant("full");
        }}
        mode="composer"
        initialTab={providerDialogInitialTab}
        initialView={providerDialogInitialView}
        variant={providerDialogVariant}
      />
    </>
  );
}

function getSuggestionIcon(path: string, entryType: string) {
  if (entryType === "tree") {
    return Folder;
  }

  if (path.endsWith(".tsx") || path.endsWith(".ts") || path.endsWith(".jsx") || path.endsWith(".js")) {
    return FileCode2;
  }

  if (path.endsWith(".md")) {
    return Info;
  }

  if (path.endsWith(".sh")) {
    return TerminalSquare;
  }

  return FileText;
}

function getSuggestionIconClass(path: string, entryType: string): string {
  if (entryType === "tree") {
    return "text-blue-400";
  }

  if (
    path.endsWith(".tsx") ||
    path.endsWith(".ts") ||
    path.endsWith(".jsx") ||
    path.endsWith(".js")
  ) {
    return "text-sky-400";
  }

  if (path.endsWith(".md")) {
    return "text-blue-400";
  }

  if (path.endsWith(".sh")) {
    return "text-orange-400";
  }

  return "text-zinc-300";
}
