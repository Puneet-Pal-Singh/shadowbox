import { useEffect, useRef, useState } from "react";
import type { RunMode } from "@repo/shared-types";
import { motion } from "framer-motion";
import { Paperclip, Plus, Sparkles } from "lucide-react";

interface ChatComposerPlusMenuProps {
  mode: RunMode;
  disabled?: boolean;
  onAddFiles: () => void;
  onModeChange?: (mode: RunMode) => void;
}

export function ChatComposerPlusMenu({
  mode,
  disabled = false,
  onAddFiles,
  onModeChange,
}: ChatComposerPlusMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent): void => {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const isPlanMode = mode === "plan";

  return (
    <div className="relative" ref={containerRef}>
      <motion.button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        whileHover={{ scale: disabled ? 1 : 1.1 }}
        whileTap={{ scale: disabled ? 1 : 0.9 }}
        className="p-1 text-zinc-500 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-60"
        title="More composer options"
        aria-label="Open composer options"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <Plus size={16} />
      </motion.button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-40 mb-2 w-64 rounded-xl border border-zinc-800 bg-[#171717] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onAddFiles();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-zinc-200 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100"
          >
            <Paperclip size={16} className="text-zinc-400" />
            Add photos & files
          </button>

          <div className="my-2 h-px bg-zinc-800" />

          <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2">
            <div className="flex items-center gap-3 text-[13px] text-zinc-200">
              <Sparkles size={16} className="text-zinc-400" />
              <span>Plan mode</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPlanMode}
              aria-label="Toggle plan mode"
              disabled={disabled || !onModeChange}
              onClick={() => {
                if (!onModeChange || disabled) {
                  return;
                }
                onModeChange(isPlanMode ? "build" : "plan");
              }}
              className={[
                "relative inline-flex h-7 w-12 items-center rounded-full border transition-colors",
                isPlanMode
                  ? "border-emerald-500/70 bg-emerald-500/20"
                  : "border-zinc-700 bg-zinc-800/80",
                disabled || !onModeChange
                  ? "cursor-not-allowed opacity-60"
                  : "hover:border-zinc-500/90",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block h-5 w-5 transform rounded-full bg-zinc-100 transition",
                  isPlanMode ? "translate-x-6" : "translate-x-1",
                ].join(" ")}
              />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
