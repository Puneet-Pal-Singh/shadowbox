import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Mic, ArrowUp, Paperclip, Square } from "lucide-react";
import type { ProviderId } from "../../types/provider";
import { useProviderStore } from "../../hooks/useProviderStore.js";
import { findCredentialByProviderId } from "../../lib/provider-helpers.js";
import { ProviderDialog, ModelPickerPopover } from "../provider/index.js";
import type { ProviderId } from "../../types/provider";

interface ChatInputBarProps {
  input: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  sessionId: string;
  onModelSelect?: (providerId: ProviderId, modelId: string) => void;
}

export function ChatInputBar({
  input,
  onChange,
  onSubmit,
  onStop,
  isLoading = false,
  placeholder = "Ask Shadowbox anything, @ to add files, / for commands",
  onModelSelect,
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
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

  const hasInput = input.trim().length > 0;

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
    if (isLegacyProviderId(lastResolvedConfig.providerId)) {
      onModelSelect(lastResolvedConfig.providerId, lastResolvedConfig.modelId);
    }
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

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="w-full max-w-4xl mx-auto px-4 pb-3"
      >
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
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            rows={1}
            className={`w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none resize-none overflow-hidden min-h-[20px] ${hasInput ? "max-h-[200px]" : "max-h-[400px]"}`}
            style={{ lineHeight: "1.5" }}
          />

          {/* Toolbar */}
          <div className="flex items-center justify-between mt-2 pt-2">
            {/* Left: Add button + Model picker */}
            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
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
                providerModels={providerModels}
                visibleModelIds={visibleModelIds}
                selectedProviderId={selectedProviderId}
                selectedModelId={selectedModelId}
                selectedModelView={selectedModelView}
                selectedProviderMetadata={
                  selectedProviderId
                    ? providerModelsMetadata[selectedProviderId] ?? null
                    : null
                }
                hasMoreSelectedProviderModels={
                  selectedProviderId
                    ? providerModelsPage[selectedProviderId]?.hasMore ?? false
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
                    providerId
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
            </div>

            {/* Right: Attachment, Mic, Send */}
            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Attach file"
              >
                <Paperclip size={16} />
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Voice input"
              >
                <Mic size={16} />
              </motion.button>

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

function isLegacyProviderId(providerId: string): providerId is ProviderId {
  return providerId === "openrouter" || providerId === "openai" || providerId === "groq";
}
