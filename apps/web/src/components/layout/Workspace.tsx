import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Files } from "lucide-react";
import { FileExplorer, FileExplorerHandle } from "../FileExplorer";
import { ChatInterface } from "../chat/ChatInterface";
import { useChat } from "../../hooks/useChat";
import { cn } from "../../lib/utils";

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
    <div className="flex-1 flex bg-black overflow-hidden relative">
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-black relative">
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

          {/* Files Toggle Button - Floating Sidebar Style */}
          <motion.button
            onClick={() => setIsExplorerOpen(!isExplorerOpen)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors border z-10",
              isExplorerOpen
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-zinc-900/80 text-zinc-500 hover:text-zinc-300 border-zinc-800 hover:bg-zinc-800/50",
            )}
            title="Toggle Files Explorer"
          >
            <Files size={18} />
          </motion.button>
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
