import { useEffect, useMemo, useState } from "react";
import { Check, GitBranch, Github, Sparkles, Upload, X } from "lucide-react";
import { useGitReview } from "./GitReviewContext";

interface GitCommitDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type CommitNextStep = "commit" | "commit-and-push" | "commit-and-pr";

export function GitCommitDialog({
  isOpen,
  onClose,
}: GitCommitDialogProps) {
  const {
    status,
    stagedFiles,
    stageAll,
    submitCommit,
    commitMessage,
    setCommitMessage,
    stageError,
    commitError,
    committing,
  } = useGitReview();
  const [includeUnstaged, setIncludeUnstaged] = useState(false);
  const [nextStep, setNextStep] = useState<CommitNextStep>("commit");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const totalChanges = status?.files.length ?? 0;
  const stagedCount = stagedFiles.size;
  const unstagedCount = Math.max(totalChanges - stagedCount, 0);
  const additions = status?.files.reduce((sum, file) => sum + file.additions, 0) ?? 0;
  const deletions = status?.files.reduce((sum, file) => sum + file.deletions, 0) ?? 0;
  const errorMessage = stageError ?? commitError;
  const canContinue =
    !committing &&
    nextStep === "commit" &&
    (stagedCount > 0 || (includeUnstaged && unstagedCount > 0));

  const stepOptions = useMemo(
    () => [
      {
        id: "commit" as const,
        label: "Commit",
        detail: includeUnstaged && unstagedCount > 0
          ? `Includes ${unstagedCount} unstaged`
          : "Staged changes only",
        enabled: true,
        icon: Sparkles,
      },
      {
        id: "commit-and-push" as const,
        label: "Commit and push",
        detail: "Coming next",
        enabled: false,
        icon: Upload,
      },
      {
        id: "commit-and-pr" as const,
        label: "Commit and create PR",
        detail: "Requires GitHub flow",
        enabled: false,
        icon: Github,
      },
    ],
    [includeUnstaged, unstagedCount],
  );

  if (!isOpen) {
    return null;
  }

  const handleContinue = async () => {
    if (nextStep !== "commit") {
      return;
    }

    if (includeUnstaged && unstagedCount > 0) {
      await stageAll();
    }

    const committed = await submitCommit();
    if (committed) {
      onClose();
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-6">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close commit dialog"
        onClick={onClose}
      />

      <div className="relative flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-[24px] border border-zinc-800 bg-[#131316] shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between px-6 py-5">
          <div className="space-y-3">
            <h2 className="text-[1.8rem] font-semibold tracking-tight text-white">
              Commit your changes
            </h2>
            <div className="flex flex-wrap items-center gap-5 text-sm text-zinc-300">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                  Branch
                </div>
                <div className="flex items-center gap-2 text-base text-white">
                  <GitBranch size={16} className="text-emerald-400" />
                  <span>{status?.branch || "No branch"}</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                  Changes
                </div>
                <div className="flex items-center gap-3 text-base">
                  <span className="text-white">{totalChanges} files</span>
                  <span className="text-emerald-400">+{additions}</span>
                  <span className="text-red-400">-{deletions}</span>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
            title="Close commit dialog"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto border-t border-zinc-800 px-6 py-5">
          <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-[#0d0d10] px-4 py-3.5">
            <div>
              <div className="text-base font-medium text-white">Include unstaged</div>
              <div className="text-xs text-zinc-500">
                Stage remaining changes before committing
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={includeUnstaged}
              onClick={() => setIncludeUnstaged((previous) => !previous)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                includeUnstaged ? "bg-blue-500" : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  includeUnstaged ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="git-commit-message"
                className="text-base font-medium text-white"
              >
                Commit message
              </label>
              <span className="text-xs text-zinc-500">Custom instructions</span>
            </div>
            <textarea
              id="git-commit-message"
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="Leave blank to autogenerate a commit message"
              className="min-h-28 w-full rounded-[18px] border border-zinc-800 bg-[#09090b] px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <div className="space-y-3 rounded-[20px] border border-zinc-800 bg-[#0d0d10] p-3.5">
            <div className="text-base font-medium text-white">Next steps</div>
            <div className="overflow-hidden rounded-[16px] border border-zinc-800">
              {stepOptions.map((option, index) => {
                const Icon = option.icon;
                const isActive = nextStep === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => option.enabled && setNextStep(option.id)}
                    disabled={!option.enabled}
                    className={`flex w-full items-center justify-between px-3.5 py-3.5 text-left transition-colors ${
                      index > 0 ? "border-t border-zinc-800" : ""
                    } ${
                      option.enabled
                        ? "bg-transparent hover:bg-zinc-900/60"
                        : "cursor-not-allowed bg-black/30 text-zinc-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        size={18}
                        className={option.enabled ? "text-zinc-300" : "text-zinc-700"}
                      />
                      <div>
                        <div
                          className={option.enabled ? "text-sm text-white" : "text-sm"}
                        >
                          {option.label}
                        </div>
                        <div className="text-xs text-zinc-500">{option.detail}</div>
                      </div>
                    </div>
                    {isActive && option.enabled ? (
                      <Check size={18} className="text-white" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue}
              className="shrink-0 rounded-full bg-white px-7 py-2.5 text-base font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {committing ? "Committing..." : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
