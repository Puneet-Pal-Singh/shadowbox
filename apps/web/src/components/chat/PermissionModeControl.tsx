import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Shield, ShieldAlert } from "lucide-react";
import { PRODUCT_MODES, type ProductMode } from "@repo/shared-types";
import { cn } from "../../lib/utils";

interface PermissionModeControlProps {
  value: ProductMode;
  onChange: (mode: ProductMode) => void;
  disabled?: boolean;
}

interface PermissionModeOption {
  value: ProductMode;
  label: string;
  shortLabel: string;
  Icon: typeof Shield;
}

const PERMISSION_MODE_OPTIONS: PermissionModeOption[] = [
  {
    value: PRODUCT_MODES.AUTO_FOR_SAFE,
    label: "Default permissions",
    shortLabel: "Default",
    Icon: Shield,
  },
  {
    value: PRODUCT_MODES.FULL_AGENT,
    label: "Full access",
    shortLabel: "Full access",
    Icon: ShieldAlert,
  },
];

export function PermissionModeControl({
  value,
  onChange,
  disabled = false,
}: PermissionModeControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption =
    PERMISSION_MODE_OPTIONS.find((option) => option.value === value) ??
    PERMISSION_MODE_OPTIONS[0]!;
  const SelectedIcon = selectedOption.Icon;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (disabled) {
            return;
          }
          setIsOpen((current) => !current);
        }}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-zinc-700/70 bg-zinc-900/80 px-2.5 py-1 text-xs font-medium text-zinc-300 transition",
          "hover:border-zinc-500/70 hover:bg-zinc-800/70 hover:text-zinc-100",
          disabled && "cursor-not-allowed opacity-60 hover:border-zinc-700/70",
        )}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Permission mode"
        data-testid="permission-mode-control"
      >
        <SelectedIcon size={14} className="text-zinc-400" />
        <span>{selectedOption.shortLabel}</span>
        <ChevronDown
          size={14}
          className={cn(
            "text-zinc-400 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-40 mb-2 w-56 rounded-3xl border border-zinc-700/80 bg-zinc-900/95 p-2 shadow-2xl"
          data-testid="permission-mode-menu"
        >
          {PERMISSION_MODE_OPTIONS.map((option) => {
            const OptionIcon = option.Icon;
            const isSelected = option.value === selectedOption.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition",
                  isSelected
                    ? "bg-zinc-800/70 text-zinc-100"
                    : "text-zinc-200 hover:bg-zinc-800/50",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <OptionIcon size={16} className="text-zinc-400" />
                  {option.label}
                </span>
                {isSelected ? <Check size={17} className="text-zinc-100" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
