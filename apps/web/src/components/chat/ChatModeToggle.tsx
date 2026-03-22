import type { RunMode } from "@repo/shared-types";

interface ChatModeToggleProps {
  mode: RunMode;
  onModeChange: (mode: RunMode) => void;
  disabled?: boolean;
}

const MODE_OPTIONS: Array<{ value: RunMode; label: string }> = [
  { value: "build", label: "Build" },
  { value: "plan", label: "Plan" },
];

export function ChatModeToggle({
  mode,
  onModeChange,
  disabled = false,
}: ChatModeToggleProps) {
  return (
    <div
      className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-950/70 p-0.5"
      role="tablist"
      aria-label="Execution mode"
    >
      {MODE_OPTIONS.map((option) => {
        const selected = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onModeChange(option.value)}
            className={[
              "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors",
              selected
                ? "bg-emerald-500 text-black"
                : "text-zinc-400 hover:text-zinc-200",
              disabled ? "cursor-not-allowed opacity-60" : "",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
