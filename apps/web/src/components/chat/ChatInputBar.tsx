import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Mic, ArrowUp, Paperclip } from "lucide-react";
import { ModelDropdown } from "./ModelDropdown";
import type { ProviderId } from "../../types/provider";

interface ChatInputBarProps {
  input: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  placeholder?: string;
  sessionId: string;
  onModelSelect?: (providerId: ProviderId, modelId: string) => void;
}

export function ChatInputBar({
  input,
  onChange,
  onSubmit,
  isLoading = false,
  placeholder = "Ask Shadowbox anything, @ to add files, / for commands",
  sessionId,
  onModelSelect,
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

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
      onSubmit();
    }
  };

  return (
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
          disabled={isLoading}
          rows={1}
          className={`w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none resize-none overflow-hidden min-h-[20px] ${hasInput ? "max-h-[200px]" : "max-h-[400px]"}`}
          style={{ lineHeight: "1.5" }}
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between mt-2 pt-2">
          {/* Left: Add button + Model selector */}
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

            <ModelDropdown
              sessionId={sessionId}
              onModelSelect={onModelSelect}
              disabled={isLoading}
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
              type="submit"
              disabled={isLoading || !input.trim()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`
                p-1.5 rounded-full transition-all
                ${
                  input.trim()
                    ? "bg-white text-black hover:bg-zinc-200"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                }
              `}
            >
              <ArrowUp size={16} />
            </motion.button>
          </div>
        </div>
      </div>
    </form>
  );
}
