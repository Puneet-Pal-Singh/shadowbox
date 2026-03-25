/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { DiffContent, FileStatus, GitStatusResponse } from "@repo/shared-types";
import { useRunContext } from "../../hooks/useRunContext";
import { useGitStatus } from "../../hooks/useGitStatus";
import { useGitDiff } from "../../hooks/useGitDiff";
import { useGitCommit } from "../../hooks/useGitCommit";
import { stageGitFiles } from "../../lib/git-client.js";

interface GitReviewProviderProps {
  children: React.ReactNode;
  isReviewOpen: boolean;
  onReviewOpenChange: (open: boolean) => void;
}

interface GitReviewContextValue {
  status: GitStatusResponse | null;
  gitAvailable: boolean;
  statusLoading: boolean;
  statusError: string | null;
  diff: DiffContent | null;
  diffError: string | null;
  stageError: string | null;
  commitError: string | null;
  diffLoading: boolean;
  committing: boolean;
  isReviewOpen: boolean;
  selectedFile: FileStatus | null;
  stagedFiles: Set<string>;
  commitMessage: string;
  openReview: (path?: string) => void;
  closeReview: () => void;
  selectFile: (file: FileStatus) => void;
  toggleFileStaged: (path: string, nextStaged: boolean) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  submitCommit: () => Promise<boolean>;
  setCommitMessage: (message: string) => void;
  refetch: () => Promise<void>;
}

const GitReviewContext = createContext<GitReviewContextValue | null>(null);

export function GitReviewProvider({
  children,
  isReviewOpen,
  onReviewOpenChange,
}: GitReviewProviderProps) {
  const { runId, sessionId } = useRunContext();
  const {
    status,
    gitAvailable,
    loading: statusLoading,
    error: statusError,
    refetch,
  } = useGitStatus(runId ?? undefined, sessionId ?? undefined);
  const {
    diff,
    loading: diffLoading,
    error: diffError,
    fetch: fetchDiff,
  } = useGitDiff(runId ?? undefined, sessionId ?? undefined);
  const {
    committing,
    error: commitError,
    commit,
  } = useGitCommit(runId ?? undefined, sessionId ?? undefined);

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [stageError, setStageError] = useState<string | null>(null);

  const selectedFile = useMemo(() => {
    if (!selectedFilePath) {
      return null;
    }

    return (
      status?.files.find((file) => file.path === selectedFilePath) ?? null
    );
  }, [selectedFilePath, status]);

  const stagedFiles = useMemo(
    () =>
      new Set(
        (status?.files ?? [])
          .filter((file) => file.isStaged)
          .map((file) => file.path),
      ),
    [status],
  );

  const selectFileForReview = useCallback(
    async (path: string, staged: boolean): Promise<void> => {
      setSelectedFilePath(path);
      await fetchDiff(path, staged);
    },
    [fetchDiff],
  );

  const openReview = useCallback(
    (path?: string) => {
      onReviewOpenChange(true);
      if (path) {
        void selectFileForReview(path, stagedFiles.has(path));
        return;
      }

      if (!selectedFilePath) {
        const [firstFile] = status?.files ?? [];
        if (firstFile) {
          void selectFileForReview(firstFile.path, stagedFiles.has(firstFile.path));
        }
      }
    },
    [onReviewOpenChange, selectFileForReview, selectedFilePath, stagedFiles, status],
  );

  const closeReview = useCallback(() => {
    onReviewOpenChange(false);
  }, [onReviewOpenChange]);

  const selectFile = useCallback(
    (file: FileStatus) => {
      void selectFileForReview(file.path, stagedFiles.has(file.path));
    },
    [selectFileForReview, stagedFiles],
  );

  const toggleFileStaged = useCallback(async (
    path: string,
    nextStaged: boolean,
  ): Promise<void> => {
    if (!runId || !sessionId) {
      setStageError(!runId ? "No run context available" : "No session context available");
      return;
    }

    setStageError(null);

    try {
      await stageGitFiles({
        runId,
        sessionId,
        files: [path],
        unstage: !nextStaged,
      });

      if (selectedFilePath === path) {
        await fetchDiff(path, nextStaged);
      }

      await refetch(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStageError(message);
      console.error("[git-review] Failed to update staged file", error);
    }
  }, [fetchDiff, refetch, runId, selectedFilePath, sessionId]);

  const updateManyFilesStage = useCallback(async (
    files: string[],
    nextStaged: boolean,
  ): Promise<void> => {
    if (!files.length) {
      return;
    }

    if (!runId || !sessionId) {
      setStageError(!runId ? "No run context available" : "No session context available");
      return;
    }

    setStageError(null);

    try {
      await stageGitFiles({
        runId,
        sessionId,
        files,
        unstage: !nextStaged,
      });

      if (selectedFilePath && files.includes(selectedFilePath)) {
        await fetchDiff(selectedFilePath, nextStaged);
      }

      await refetch(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStageError(message);
      console.error("[git-review] Failed to update staged files", error);
    }
  }, [fetchDiff, refetch, runId, selectedFilePath, sessionId]);

  const stageAll = useCallback(async (): Promise<void> => {
    const files = status?.files
      .filter((file) => !stagedFiles.has(file.path))
      .map((file) => file.path) ?? [];

    await updateManyFilesStage(files, true);
  }, [stagedFiles, status, updateManyFilesStage]);

  const unstageAll = useCallback(async (): Promise<void> => {
    const files = status?.files
      .filter((file) => stagedFiles.has(file.path))
      .map((file) => file.path) ?? [];

    await updateManyFilesStage(files, false);
  }, [stagedFiles, status, updateManyFilesStage]);

  const submitCommit = useCallback(async (): Promise<boolean> => {
    if (!commitMessage.trim()) {
      return false;
    }

    const committed = await commit({ message: commitMessage.trim() });
    if (!committed) {
      return false;
    }

    setCommitMessage("");
    setSelectedFilePath(null);
    await refetch(true);
    return true;
  }, [commit, commitMessage, refetch]);

  const forceRefetch = useCallback(async (): Promise<void> => {
    await refetch(true);
  }, [refetch]);

  const contextValue: GitReviewContextValue = {
    status,
    gitAvailable,
    statusLoading,
    statusError,
    diff,
    diffError,
    stageError,
    commitError,
    diffLoading,
    committing,
    isReviewOpen,
    selectedFile,
    stagedFiles,
    commitMessage,
    openReview,
    closeReview,
    selectFile,
    toggleFileStaged,
    stageAll,
    unstageAll,
    submitCommit,
    setCommitMessage,
    refetch: forceRefetch,
  };

  return (
    <GitReviewContext.Provider value={contextValue}>
      {children}
    </GitReviewContext.Provider>
  );
}

export function useGitReview(): GitReviewContextValue {
  const context = useContext(GitReviewContext);

  if (!context) {
    throw new Error("useGitReview must be used within a GitReviewProvider");
  }

  return context;
}
