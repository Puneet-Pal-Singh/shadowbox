import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Plus, Mic, ArrowUp, Paperclip } from "lucide-react";

interface ChatInputBarProps {
  input: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatInputBar({
  input,
  onChange,
  onSubmit,
  isLoading = false,
  placeholder = "Ask Shadowbox anything, @ to add files, / for commands",
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 400);
      textareaRef.current.style.height = newHeight + "px";
    }
  }, [input]);

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
      className="w-full max-w-4xl mx-auto px-4 pb-4"
    >
      <div
        className={`
          bg-[#171717] rounded-2xl p-4
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
          className="w-full bg-transparent text-base text-white placeholder-zinc-500 focus:outline-none resize-none overflow-hidden min-h-[24px] max-h-[400px]"
          style={{ lineHeight: "1.5" }}
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between mt-3 pt-3">
          {/* Left: Add button + Model selector */}
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Add files"
            >
              <Plus size={18} />
            </motion.button>

            <div className="h-4 w-px bg-zinc-800" />

            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <span className="font-medium">GPT-5.2-Codex</span>
              <span className="text-zinc-600">Medium</span>
              <ChevronDown size={14} />
            </motion.button>
          </div>

          {/* Right: Attachment, Mic, Send */}
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Attach file"
            >
              <Paperclip size={18} />
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Voice input"
            >
              <Mic size={18} />
            </motion.button>

            <motion.button
              type="submit"
              disabled={isLoading || !input.trim()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`
                p-2 rounded-full transition-all
                ${
                  input.trim()
                    ? "bg-white text-black hover:bg-zinc-200"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                }
              `}
            >
              <ArrowUp size={18} />
            </motion.button>
          </div>
        </div>
      </div>
    </form>
  );
}
