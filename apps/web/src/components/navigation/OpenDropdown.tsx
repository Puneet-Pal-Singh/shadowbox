import { ChevronDown, Code2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

interface OpenDropdownProps {
  onSelect?: (option: string) => void;
}

const OPEN_OPTIONS = [
  { id: "vscode", label: "VS Code", icon: Code2 },
  { id: "cursor", label: "Cursor", icon: Code2 },
  { id: "windsurf", label: "Windsurf", icon: Code2 },
];

export function OpenDropdown({ onSelect }: OpenDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState("vscode");

  const handleSelect = (optionId: string) => {
    setSelected(optionId);
    setIsOpen(false);
    onSelect?.(optionId);
  };

  const selectedOption = OPEN_OPTIONS.find((opt) => opt.id === selected);
  const Icon = selectedOption?.icon ?? Code2;

  return (
    <div className="relative">
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900/50 hover:bg-zinc-800/50 border border-zinc-800 rounded-md transition-all"
      >
        <Icon size={14} className="text-blue-400" />
        <span>Open</span>
        <ChevronDown
          size={12}
          className={`text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </motion.button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-1 w-40 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden"
          >
            {OPEN_OPTIONS.map((option) => {
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    selected === option.id
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                  }`}
                >
                  <OptionIcon size={14} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </motion.div>
        </>
      )}
    </div>
  );
}
