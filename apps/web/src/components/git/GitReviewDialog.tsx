import { useEffect, useState } from "react";
import { FileDiff, GitBranch, X } from "lucide-react";
import { ChangesPanel } from "../sidebar/ChangesPanel";
import { useGitReview } from "./GitReviewContext";
import { GitCommitDialog } from "./GitCommitDialog";

interface GitReviewDialogProps {
  initialIntent?: "review" | "commit";
}

export function GitReviewDialog({
  initialIntent = "review",
}: GitReviewDialogProps) {
  const {
    isReviewOpen,
    closeReview,
    status,
    stagedFiles,
    selectedFile,
    selectFile,
  } = useGitReview();
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(
    initialIntent === "commit",
  );

  useEffect(() => {
    if (!isReviewOpen || selectedFile || !status?.files.length) {
      return;
    }

    const [firstFile] = status.files;
    if (firstFile) {
      selectFile(firstFile);
    }
  }, [isReviewOpen, selectFile, selectedFile, status?.files]);

  useEffect(() => {
    if (!isReviewOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeReview();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeReview, isReviewOpen]);

  if (!isReviewOpen) {
    return null;
  }

  const totalChanges = status?.files.length ?? 0;
  const stagedCount = stagedFiles.size;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-6 py-8 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close git review"
        onClick={closeReview}
      />

      <div className="relative flex h-full max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#09090b] shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
              <FileDiff size={14} />
              Review Changes
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 font-medium text-zinc-200">
                <GitBranch size={14} className="text-emerald-400" />
                {status?.branch || "No branch"}
              </span>
              <span>{totalChanges} changed</span>
              <span>{stagedCount} staged</span>
              <span>{Math.max(totalChanges - stagedCount, 0)} unstaged</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCommitDialogOpen(true)}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/15 hover:text-emerald-200"
            >
              Commit
            </button>

            <button
              type="button"
              onClick={closeReview}
              className="rounded-lg border border-zinc-800 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
              title="Close review"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <ChangesPanel className="h-full p-5" mode="modal" />
        </div>

        <GitCommitDialog
          key={isCommitDialogOpen ? "commit-open" : "commit-closed"}
          isOpen={isCommitDialogOpen}
          onClose={() => setIsCommitDialogOpen(false)}
        />
      </div>
    </div>
  );
}
