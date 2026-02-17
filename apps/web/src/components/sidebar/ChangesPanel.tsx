import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { FileStatus } from "@repo/shared-types";
import { useGitStatus } from "../../hooks/useGitStatus";
import { useGitDiff } from "../../hooks/useGitDiff";
import { useGitCommit } from "../../hooks/useGitCommit";
import { ChangesList } from "../diff/ChangesList";
import { DiffViewer } from "../diff/DiffViewer";
import { useRunContext } from "../../hooks/useRunContext";
import { getBrainHttpBase } from "../../lib/platform-endpoints";

interface ChangesPanelProps {
  className?: string;
  mode?: "sidebar" | "modal";
  onFileSelect?: (path: string) => void;
}

export function ChangesPanel({ 
  className = "", 
  mode = "sidebar",
  onFileSelect 
}: ChangesPanelProps) {
  const { runId } = useRunContext();
  const { status, loading: statusLoading, error: statusError, refetch } = useGitStatus();
  const { diff, loading: diffLoading, fetch: fetchDiff } = useGitDiff();
  const { committing, error: commitError, commit } = useGitCommit();

  const [selectedFile, setSelectedFile] = useState<FileStatus | null>(null);
  const [stagedFiles, setStagedFiles] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState("");

  useEffect(() => {
    if (status) {
      const staged = new Set<string>(
        status.files.filter((f: FileStatus) => f.isStaged).map((f: FileStatus) => f.path),
      );
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStagedFiles(staged);
    }
  }, [status]);

  useEffect(() => {
    if (selectedFile) {
      fetchDiff(selectedFile.path, stagedFiles.has(selectedFile.path));
    }
  }, [selectedFile, fetchDiff, stagedFiles]);

  const handleSelectFile = (file: FileStatus) => {
    setSelectedFile(file);
    onFileSelect?.(file.path);
  };

  const handleToggleStaged = async (path: string, staged: boolean) => {
    if (!runId) return;

    try {
      const endpoint = `${getBrainHttpBase()}/api/git/${staged ? "stage" : "unstage"}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, files: [path] }),
      });

      if (response.ok) {
        const newSet = new Set(stagedFiles);
        if (staged) {
          newSet.add(path);
        } else {
          newSet.delete(path);
        }
        setStagedFiles(newSet);
        await refetch();
      }
    } catch (err) {
      console.error("[ChangesPanel] Toggle staged error:", err);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      alert("Please enter a commit message");
      return;
    }

    await commit({ message: commitMessage });
    setCommitMessage("");
    await refetch();
  };

  if (statusLoading) {
    return (
      <div
        className={`flex items-center justify-center h-full bg-black ${className}`}
      >
        <LoaderCircle className="animate-spin text-zinc-400" size={24} />
      </div>
    );
  }

  if (statusError) {
    return (
      <div className={`p-4 text-red-400 text-sm bg-black ${className}`}>
        Error: {statusError}
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full gap-4 p-4 bg-black ${className}`}>
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* List Section */}
        <div 
          className={`flex flex-col bg-black rounded-lg border border-zinc-800 overflow-y-auto scrollbar-hide ${
            mode === "sidebar" ? "w-full" : "w-80"
          }`}
        >
          <ChangesList
            files={status?.files || []}
            selectedFile={selectedFile}
            onSelectFile={handleSelectFile}
            stagedFiles={stagedFiles}
            onToggleStaged={handleToggleStaged}
          />
        </div>

        {/* Diff Section - Only visible in modal mode */}
        {mode === "modal" && (
          <div className="flex-1 flex flex-col overflow-hidden bg-zinc-900/30 rounded-lg border border-zinc-800">
            {selectedFile && diff ? (
              <DiffViewer
                diff={diff}
                className="flex-1 overflow-hidden"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                {selectedFile
                  ? diffLoading
                    ? "Loading diff..."
                    : "No diff available"
                  : "Select a file to view changes"}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 pt-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-2">
            Commit Message
          </label>
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Describe your changes..."
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
            rows={2}
          />
        </div>

        {commitError && (
          <div className="text-xs text-red-400">{commitError}</div>
        )}

        <button
          onClick={handleCommit}
          disabled={committing || !commitMessage.trim()}
          className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium rounded transition-colors"
        >
          {committing ? "Committing..." : "Commit"}
        </button>
      </div>
    </div>
  );
}