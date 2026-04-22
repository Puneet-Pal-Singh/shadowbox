/**
 * Chat Input Component (Provider Runtime v3)
 *
 * Gated send on provider resolution readiness.
 * Ensures provider config is resolved before sending chat message.
 */

import React, { useState, useRef, useEffect } from "react";
import { useProviderStore } from "../../hooks/useProviderStore.js";

/**
 * Chat Input Props
 */
export interface ChatInputProps {
  onSendMessage: (message: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * ChatInput Component with provider resolution gating
 */
export function ChatInput({
  onSendMessage,
  disabled = false,
}: ChatInputProps): React.ReactElement {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showProviderError, setShowProviderError] = useState(false);
  const [providerErrorMessage, setProviderErrorMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    status,
    error: storeError,
    lastResolvedConfig,
    bootstrap,
  } = useProviderStore();

  // Bootstrap store on mount
  useEffect(() => {
    if (status === "idle") {
      bootstrap().catch(console.error);
    }
  }, [status, bootstrap]);

  /**
   * Handle message send with provider resolution gating
   */
  const handleSend = async () => {
    // Gate 1: Store not ready
    if (status === "loading") {
      setShowProviderError(true);
      setProviderErrorMessage(
        "Loading provider configuration... Please wait."
      );
      return;
    }

    if (status === "error") {
      setShowProviderError(true);
      setProviderErrorMessage(
        storeError || "Failed to load provider configuration."
      );
      return;
    }

    // Gate 2: Message not empty
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    // Safe to send
    setShowProviderError(false);
    setMessage("");
    setIsLoading(true);

    try {
      await onSendMessage(trimmedMessage);
    } catch (err) {
      console.error("[ChatInput] Send failed:", err);
      setMessage(trimmedMessage); // Restore message on error
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle key press (Enter to send)
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !isLoading
    ) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Auto-resize textarea
   */
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const isSendDisabled =
    disabled ||
    isLoading ||
    status !== "ready" ||
    !message.trim();

  return (
    <div className="flex flex-col gap-3">
      {/* Provider Error Banner */}
      {showProviderError && (
        <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900">
              {providerErrorMessage}
            </p>
            {status === "error" && (
              <p className="text-xs text-amber-700 mt-1">
                Provider configuration error. Check your credentials in settings.
              </p>
            )}
          </div>
          <button
            onClick={() => setShowProviderError(false)}
            className="text-amber-600 hover:text-amber-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Status Badge */}
      {status !== "ready" && (
        <div className="flex items-center gap-2 text-xs">
          {status === "loading" && (
            <>
              <div className="animate-spin w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full" />
              <span className="text-blue-600 font-medium">
                Loading provider configuration...
              </span>
            </>
          )}
          {status === "idle" && (
            <>
              <div className="w-3 h-3 bg-gray-300 rounded-full" />
              <span className="text-gray-600">Initializing...</span>
            </>
          )}
          {status === "error" && (
            <>
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span className="text-red-600 font-medium">Configuration error</span>
            </>
          )}
        </div>
      )}

      {/* Resolved Config Info (Debug) */}
      {lastResolvedConfig && status === "ready" && (
        <div className="text-xs text-gray-600 flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span>
            Using {lastResolvedConfig.providerId}
            {lastResolvedConfig.modelId &&
              ` · ${lastResolvedConfig.modelId}`}
          </span>
        </div>
      )}

      {/* Input Area */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            status !== "ready"
              ? "Waiting for provider configuration..."
              : "Type your message... (Shift+Enter for new line)"
          }
          disabled={disabled || status !== "ready"}
          className="flex-1 border rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
          style={{ minHeight: "44px", maxHeight: "200px" }}
        />

        <button
          onClick={handleSend}
          disabled={isSendDisabled}
          className={`px-4 py-3 rounded-lg font-medium transition ${
            isSendDisabled
              ? "bg-gray-300 text-gray-600 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
          }`}
          title={
            status !== "ready"
              ? "Waiting for provider configuration..."
              : "Send message (Enter)"
          }
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
              Sending...
            </span>
          ) : (
            "Send"
          )}
        </button>
      </div>

      {/* Keyboard Hint */}
      {status === "ready" && (
        <p className="text-xs text-gray-500 text-right">
          Press Enter to send, Shift+Enter for new line
        </p>
      )}
    </div>
  );
}
