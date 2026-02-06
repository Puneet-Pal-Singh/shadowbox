import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { FileStatus, DiffContent } from "@repo/shared-types";
import { useGitStatus } from "../../hooks/useGitStatus";
import { useGitDiff } from "../../hooks/useGitDiff";
import { useGitCommit } from "../../hooks/useGitCommit";
import { ChangesList } from "../diff/ChangesList";
import { DiffViewer } from "../diff/DiffViewer";
import { useRunContext } from "../../hooks/useRunContext";

interface ChangesPanelProps {
  className?: string;
}

export function ChangesPanel({ className = "" }: ChangesPanelProps) {
  const { runId } = useRunContext();
  const { status, loading: statusLoading, error: statusError, refetch } = useGitStatus();
  const { diff, loading: diffLoading, fetch: fetchDiff } = useGitDiff();
  const { committing, error: commitError, commit } = useGitCommit();

  const [selectedFile, setSelectedFile] = useState<FileStatus | null>(null);
  const [stagedFiles, setStagedFiles] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState("");

  useEffect(() => {
    if (status) {
      const staged = new Set(
        status.files.filter((f) => f.isStaged).map((f) => f.path),
      );
      setStagedFiles(staged);
    }
  }, [status]);

  useEffect(() => {
    if (selectedFile) {
      fetchDiff(selectedFile.path, stagedFiles.has(selectedFile.path));
    }
  }, [selectedFile]);

  const handleToggleStaged = async (path: string, staged: boolean) => {
    if (!runId) return;

    try {
      const response = await fetch(
        `/api/git/${staged ? "stage" : "unstage"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId, files: [path] }),
        },
      );

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
        className={`flex items-center justify-center h-full ${className}`}
      >
        <LoaderCircle className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  if (statusError) {
    return (
      <div className={`p-4 text-red-400 text-sm ${className}`}>
        Error: {statusError}
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full gap-4 p-4 bg-gray-950 ${className}`}>
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        <div className="w-80 flex flex-col bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <ChangesList
            files={status?.files || []}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            stagedFiles={stagedFiles}
            onToggleStaged={handleToggleStaged}
          />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedFile && diff ? (
            <DiffViewer
              diff={diff}
              className="flex-1 overflow-hidden"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              {selectedFile
                ? diffLoading
                  ? "Loading diff..."
                  : "No diff available"
                : "Select a file to view changes"}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-800 pt-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-2">
            Commit Message
          </label>
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Describe your changes..."
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-600"
            rows={2}
          />
        </div>

        {commitError && (
          <div className="text-xs text-red-400">{commitError}</div>
        )}

        <button
          onClick={handleCommit}
          disabled={committing || !commitMessage.trim()}
          className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded transition-colors"
        >
          {committing ? "Committing..." : "Commit"}
        </button>
      </div>
    </div>
  );
}
