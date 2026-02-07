import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, ArrowLeft, Loader2 } from "lucide-react";
import type { DiffContent } from "@repo/shared-types";
import { FileExplorer, FileExplorerHandle } from "../FileExplorer";
import { ChatInterface } from "../chat/ChatInterface";
import { ChangesPanel } from "../sidebar/ChangesPanel";
import { RunContextProvider } from "../../hooks/useRunContext";
import { useChat } from "../../hooks/useChat";
import { cn } from "../../lib/utils";
import { useGitStatus } from "../../hooks/useGitStatus";
import { useGitDiff } from "../../hooks/useGitDiff";
import { Resizer } from "../ui/Resizer";
import { ArtifactView } from "../chat/ArtifactView";
import { DiffViewer } from "../diff/DiffViewer";
import { RepoFileTree } from "../github/RepoFileTree";
import { useGitHub } from "../github/GitHubContextProvider";
import {
  getRepositoryTree,
  getFileContent,
} from "../../services/GitHubService";

interface WorkspaceProps {
  sessionId: string;
  isRightSidebarOpen?: boolean;
  setIsRightSidebarOpen?: (open: boolean) => void;
}

export function Workspace({
  sessionId: runId,
  isRightSidebarOpen = false,
  setIsRightSidebarOpen,
}: WorkspaceProps) {
  const explorerRef = useRef<FileExplorerHandle>(null);
  const sandboxId = runId;
  const { repo, branch, isLoaded: isGitHubLoaded } = useGitHub();

  // GitHub repository tree state
  const [repoTree, setRepoTree] = useState<
    Array<{ path: string; type: string; sha: string }>
  >([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  // Fetch repository tree when GitHub context changes
  useEffect(() => {
    console.log("[Workspace] GitHub context changed:", {
      repo: repo?.full_name,
      branch,
      isGitHubLoaded,
    });

    if (!repo || !isGitHubLoaded) {
      console.log("[Workspace] No repo or not loaded yet, clearing tree");
      setRepoTree([]);
      return;
    }

    const fetchTree = async () => {
      console.log("[Workspace] Fetching tree for:", repo.full_name, branch);
      setIsLoadingTree(true);
      try {
        const tree = await getRepositoryTree(
          repo.owner.login,
          repo.name,
          branch,
        );
        console.log("[Workspace] Fetched tree with", tree.length, "items");
        setRepoTree(tree);
      } catch (error) {
        console.error("[Workspace] Failed to fetch repository tree:", error);
        setRepoTree([]);
      } finally {
        setIsLoadingTree(false);
      }
    };

    fetchTree();
  }, [repo, branch, isGitHubLoaded]);

  // Sidebar states
  const [activeTab, setActiveTab] = useState<"files" | "changes">(() => {
    return (
      (localStorage.getItem("shadowbox_active_tab") as "files" | "changes") ||
      "files"
    );
  });

  useEffect(() => {
    localStorage.setItem("shadowbox_active_tab", activeTab);
  }, [activeTab]);
  const [sidebarWidth, setSidebarWidth] = useState(440);
  const [isResizing, setIsResizing] = useState(false);

  // Content view states
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    content: string;
  } | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<{
    path: string;
    content: DiffContent;
  } | null>(null);
  const [isViewingContent, setIsViewingContent] = useState(() => {
    return localStorage.getItem("shadowbox_is_viewing_content") === "true";
  });
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  useEffect(() => {
    localStorage.setItem(
      "shadowbox_is_viewing_content",
      String(isViewingContent),
    );
  }, [isViewingContent]);

  const { status } = useGitStatus();
  const { fetch: fetchDiff, diff } = useGitDiff();
  const changesCount = status?.files.length || 0;

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

  // Sync diff from hook to local state when it loads
  useEffect(() => {
    if (diff && activeTab === "changes") {
      setSelectedDiff({ path: diff.newPath, content: diff });
      setIsViewingContent(true);
    }
  }, [diff, activeTab]);

  const handleFileClick = useCallback(
    async (path: string) => {
      setIsLoadingContent(true);
      setIsViewingContent(true);
      localStorage.setItem("shadowbox_last_viewed_path", path);
      try {
        const res = await fetch(`http://localhost:8787/?session=${sandboxId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plugin: "filesystem",
            payload: { action: "read_file", runId, path },
          }),
        });

        let data;
        try {
          data = await res.json();
        } catch (parseError) {
          console.error("Failed to parse file response:", parseError);
          setSelectedFile({
            path,
            content:
              "// [Error] The server returned unreadable data. This usually happens with large binary files.",
          });
          return;
        }

        if (data.success) {
          if (data.isBinary || data.output === "[BINARY_FILE_DETECTED]") {
            setSelectedFile({
              path,
              content:
                "// [Shadowbox] This file is a binary and cannot be displayed in the text editor.",
            });
          } else {
            setSelectedFile({ path, content: data.output });
          }
        }
      } catch (e) {
        console.error("Failed to read file:", e);
        setSelectedFile({
          path,
          content: "// [Error] Failed to connect to server or read file.",
        });
      } finally {
        setIsLoadingContent(false);
      }
    },
    [sandboxId, runId],
  );

  // Restore selected file on mount if we were viewing one
  useEffect(() => {
    if (isHydrating) return;

    const savedPath = localStorage.getItem("shadowbox_last_viewed_path");
    console.log(
      `🧬 [Shadowbox] Restoration Check: isViewing=${isViewingContent}, path=${savedPath}, selectedFile=${!!selectedFile}`,
    );

    if (isViewingContent && savedPath && !selectedFile && !selectedDiff) {
      console.log(`🧬 [Shadowbox] Restoring last viewed file: ${savedPath}`);
      handleFileClick(savedPath);
    }
  }, [
    isHydrating,
    isViewingContent,
    selectedFile,
    selectedDiff,
    handleFileClick,
  ]);

  const handleViewChange = (path: string) => {
    fetchDiff(path);
    // Diff view will be set by the useEffect above
  };

  // Handle file selection from GitHub repository
  const handleGitHubFileSelect = useCallback(
    async (path: string) => {
      if (!repo) return;

      setIsLoadingContent(true);
      setIsViewingContent(true);
      localStorage.setItem("shadowbox_last_viewed_path", path);

      try {
        const fileData = await getFileContent(
          repo.owner.login,
          repo.name,
          path,
          branch,
        );

        // GitHub API returns base64 encoded content
        if (fileData.encoding === "base64") {
          const decoded = atob(fileData.content);
          setSelectedFile({ path, content: decoded });
        } else {
          setSelectedFile({ path, content: fileData.content });
        }
      } catch (error) {
        console.error("Failed to fetch GitHub file content:", error);
        setSelectedFile({
          path,
          content: "// [Error] Failed to fetch file content from GitHub.",
        });
      } finally {
        setIsLoadingContent(false);
      }
    },
    [repo, branch],
  );

  return (
    <RunContextProvider runId={runId}>
      <div className="flex-1 flex bg-black overflow-hidden relative">
        {/* Chat Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-black relative">
          {isHydrating ? (
            <div className="flex-1 flex items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                  Hydrating History...
                </span>
              </div>
            </div>
          ) : (
            <ChatInterface
              chatProps={{
                messages,
                input,
                handleInputChange,
                handleSubmit,
                isLoading,
              }}
              onArtifactOpen={(path, content) => {
                setSelectedFile({ path, content });
                setIsViewingContent(true);
                setIsRightSidebarOpen?.(true);
                setActiveTab("files");
              }}
            />
          )}
        </main>

        {/* Combined Sidebar */}
        <motion.aside
          initial={false}
          animate={{
            width: isRightSidebarOpen ? sidebarWidth : 0,
          }}
          transition={
            isResizing
              ? { duration: 0 }
              : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }
          }
          className={cn(
            "border-l border-zinc-800 bg-black flex flex-col overflow-hidden shrink-0 relative",
            !isRightSidebarOpen && "border-transparent",
          )}
        >
          {isRightSidebarOpen && (
            <Resizer
              side="right"
              onResizeStart={() => setIsResizing(true)}
              onResizeEnd={() => setIsResizing(false)}
              onResize={(delta) =>
                setSidebarWidth((prev) =>
                  Math.max(280, Math.min(600, prev + delta)),
                )
              }
            />
          )}

          <div
            className="flex-1 flex flex-col min-w-[280px]"
            style={{ width: sidebarWidth }}
          >
            {/* Sidebar Header */}
            <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-3 bg-black shrink-0">
              <div className="flex gap-4 h-full">
                {isViewingContent ? (
                  <button
                    onClick={() => {
                      setIsViewingContent(false);
                      setSelectedFile(null);
                      setSelectedDiff(null);
                    }}
                    className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                  >
                    <ArrowLeft size={14} />
                    Back
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setActiveTab("files")}
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wide transition-colors relative h-full flex items-center",
                        activeTab === "files"
                          ? "text-white"
                          : "text-zinc-500 hover:text-zinc-300",
                      )}
                    >
                      Files
                      {activeTab === "files" && (
                        <motion.div
                          layoutId="activeTab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-400"
                        />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab("changes")}
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wide transition-colors relative h-full flex items-center gap-1.5",
                        activeTab === "changes"
                          ? "text-white"
                          : "text-zinc-500 hover:text-zinc-300",
                      )}
                    >
                      Changes
                      {changesCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] rounded-full">
                          {changesCount}
                        </span>
                      )}
                      {activeTab === "changes" && (
                        <motion.div
                          layoutId="activeTab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-400"
                        />
                      )}
                    </button>
                  </>
                )}
              </div>

              <button
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-900"
                title="Expand"
              >
                <Maximize2 size={14} />
              </button>
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 overflow-hidden relative">
              <AnimatePresence mode="wait" initial={false}>
                {isViewingContent ? (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="absolute inset-0 flex flex-col overflow-y-auto"
                  >
                    {isLoadingContent ? (
                      <div className="flex-1 flex items-center justify-center">
                        <Loader2
                          size={24}
                          className="animate-spin text-zinc-600"
                        />
                      </div>
                    ) : selectedFile ? (
                      <ArtifactView
                        isOpen={true}
                        onClose={() => setIsViewingContent(false)}
                        title={selectedFile.path}
                        content={selectedFile.content}
                      />
                    ) : selectedDiff ? (
                      <DiffViewer
                        diff={selectedDiff.content}
                        className="flex-1"
                      />
                    ) : null}
                  </motion.div>
                ) : activeTab === "files" ? (
                  <motion.div
                    key="files"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 overflow-y-auto"
                  >
                    {repo && isGitHubLoaded ? (
                      <RepoFileTree
                        owner={repo.owner.login}
                        repo={repo.name}
                        branch={branch}
                        tree={repoTree}
                        isLoading={isLoadingTree}
                        onFileSelect={handleGitHubFileSelect}
                      />
                    ) : (
                      <FileExplorer
                        ref={explorerRef}
                        sessionId={sandboxId}
                        runId={runId}
                        onFileClick={handleFileClick}
                      />
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="changes"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 overflow-y-auto"
                  >
                    <ChangesPanel
                      mode="sidebar"
                      onFileSelect={handleViewChange}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.aside>
      </div>
    </RunContextProvider>
  );
}
