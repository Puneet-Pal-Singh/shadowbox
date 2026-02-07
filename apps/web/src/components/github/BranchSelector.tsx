/**
 * Branch Selector Component
 *
 * Displays current branch and allows switching between branches.
 * Pure UI component - business logic handled by parent.
 * Follows SOLID: Single Responsibility, Dependency Inversion.
 *
 * @module components/github/BranchSelector
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, ChevronDown, Search, Check } from "lucide-react";
import { cn } from "../../lib/utils";

interface Branch {
  name: string;
  protected: boolean;
}

interface BranchSelectorProps {
  /** Currently selected branch */
  currentBranch: string;
  /** List of available branches */
  branches: Branch[];
  /** Loading state */
  isLoading?: boolean;
  /** Callback when branch is selected */
  onBranchSelect: (branch: string) => void;
  /** Optional className for styling */
  className?: string;
}

/**
 * BranchSelector Component
 *
 * Renders a dropdown button showing the current branch.
 * Clicking opens a searchable list of all branches.
 *
 * @example
 * ```tsx
 * <BranchSelector
 *   currentBranch="main"
 *   branches={[{ name: "main", protected: true }, { name: "dev", protected: false }]}
 *   onBranchSelect={(branch) => console.log("Switched to:", branch)}
 * />
 * ```
 */
export function BranchSelector({
  currentBranch,
  branches,
  isLoading = false,
  onBranchSelect,
  className,
}: BranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
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

  // Filter branches based on search query
  const filteredBranches = branches.filter((branch) =>
    branch.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Sort branches: current first, then protected, then alphabetical
  const sortedBranches = [...filteredBranches].sort((a, b) => {
    if (a.name === currentBranch) return -1;
    if (b.name === currentBranch) return 1;
    if (a.protected && !b.protected) return -1;
    if (!a.protected && b.protected) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleBranchClick = (branchName: string) => {
    if (branchName !== currentBranch) {
      onBranchSelect(branchName);
    }
    setIsOpen(false);
    setSearchQuery("");
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/50 text-zinc-500 text-sm",
          className,
        )}
      >
        <GitBranch size={14} />
        <span>Loading branches...</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Main Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
          "bg-zinc-900/50 hover:bg-zinc-800/70 text-zinc-300 hover:text-white",
          "border border-zinc-800 hover:border-zinc-700",
          isOpen && "bg-zinc-800/70 border-zinc-700",
        )}
      >
        <GitBranch size={14} className="text-zinc-500" />
        <span className="max-w-[150px] truncate">{currentBranch}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={14} className="text-zinc-500" />
        </motion.div>
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className={cn(
              "absolute left-0 top-full mt-2 z-50",
              "w-72 rounded-xl overflow-hidden",
              "bg-[#1a1a1a] border border-zinc-800",
              "shadow-2xl shadow-black/50",
            )}
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-zinc-800">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Switch Branch
              </span>
            </div>

            {/* Search */}
            <div className="p-2 border-b border-zinc-800">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find a branch..."
                  className={cn(
                    "w-full pl-9 pr-3 py-2 rounded-lg",
                    "bg-zinc-900/50 text-sm text-zinc-200 placeholder-zinc-600",
                    "border border-zinc-800 focus:border-zinc-600",
                    "focus:outline-none focus:ring-1 focus:ring-zinc-600",
                  )}
                  autoFocus
                />
              </div>
            </div>

            {/* Branch List */}
            <div className="max-h-64 overflow-y-auto py-1">
              {sortedBranches.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-zinc-500">
                  No branches found
                </div>
              ) : (
                sortedBranches.map((branch) => (
                  <motion.button
                    key={branch.name}
                    onClick={() => handleBranchClick(branch.name)}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left",
                      "transition-colors duration-150",
                      branch.name === currentBranch && "bg-zinc-800/50",
                    )}
                  >
                    <div className="w-4 flex justify-center">
                      {branch.name === currentBranch ? (
                        <Check size={14} className="text-emerald-500" />
                      ) : (
                        <GitBranch
                          size={14}
                          className={cn(
                            "text-zinc-600",
                            branch.protected && "text-amber-500",
                          )}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className={cn(
                          "block text-sm truncate",
                          branch.name === currentBranch
                            ? "text-white font-medium"
                            : "text-zinc-300",
                        )}
                      >
                        {branch.name}
                      </span>
                    </div>
                    {branch.protected && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded">
                        Protected
                      </span>
                    )}
                  </motion.button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-900/30">
              <span className="text-xs text-zinc-600">
                {branches.length} branches total
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
