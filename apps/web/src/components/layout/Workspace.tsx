import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileExplorer, FileExplorerHandle } from "../FileExplorer";
import { ChatInterface } from "../chat/ChatInterface";
import { useChat } from "../../hooks/useChat";
import { cn } from "../../lib/utils";
import { PanelRight } from "lucide-react";

export function Workspace({ sessionId: runId }: { sessionId: string }) {
  const explorerRef = useRef<FileExplorerHandle>(null);
  const sandboxId = runId;
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    isHydrating,
  } = useChat(sandboxId, runId, () => {
    explorerRef.current?.refresh();
  });

  const handleFileClick = async (path: string) => {
    console.log("Clicked file:", path);
  };

  if (isHydrating) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
            Hydrating History...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-black overflow-hidden relative">
      {/* Sub-header with file explorer toggle */}
      <div className="h-10 border-b border-border bg-black flex items-center justify-end px-3">
        <motion.button
          onClick={() => setIsExplorerOpen(!isExplorerOpen)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "p-1.5 rounded transition-colors border",
            isExplorerOpen
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "text-zinc-500 hover:text-zinc-300 border-transparent hover:bg-zinc-800/30",
          )}
          title="Toggle Files Explorer"
        >
          <PanelRight size={16} />
        </motion.button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area (Full Width, Expandable) */}
        <main className="flex-1 flex flex-col min-w-0 bg-black">
          <ChatInterface
            chatProps={{
              messages,
              input,
              handleInputChange,
              handleSubmit,
              isLoading,
            }}
            onArtifactOpen={() => {}}
          />
        </main>

        {/* File Explorer (Collapsible Right Sidebar) */}
        <motion.aside
          initial={false}
          animate={{
            width: isExplorerOpen ? 280 : 0,
            opacity: isExplorerOpen ? 1 : 0,
          }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className={cn(
            "border-l border-border bg-black flex flex-col overflow-hidden shrink-0",
            !isExplorerOpen && "pointer-events-none",
          )}
        >
          {isExplorerOpen && (
            <div className="flex-1 flex flex-col min-w-0 w-72">
              {/* Sidebar Header */}
              <div className="h-10 border-b border-border flex items-center px-3 bg-black">
                <span className="text-xs font-semibold uppercase text-zinc-500 tracking-wide">
                  Files
                </span>
              </div>
              {/* Sidebar Content */}
              <div className="flex-1 overflow-y-auto">
                <FileExplorer
                  ref={explorerRef}
                  sessionId={sandboxId}
                  runId={runId}
                  onFileClick={handleFileClick}
                />
              </div>
            </div>
          )}
        </motion.aside>
      </div>
    </div>
  );
}
