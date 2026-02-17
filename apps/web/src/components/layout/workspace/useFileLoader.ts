import { useCallback } from "react";
import { useGitHub } from "../../github/GitHubContextProvider";
import { getFileContent } from "../../../services/GitHubService";
import { terminalCommandPath } from "../../../lib/platform-endpoints";
import type { SelectedFile } from "./useWorkspaceState";

interface UseFileLoaderProps {
  sandboxId: string;
  runId: string;
  setIsLoadingContent: (loading: boolean) => void;
  setIsViewingContent: (viewing: boolean) => void;
  setSelectedFile: (file: SelectedFile | null) => void;
}

export function useFileLoader({
  sandboxId,
  runId,
  setIsLoadingContent,
  setIsViewingContent,
  setSelectedFile,
}: UseFileLoaderProps) {
  const { repo, branch } = useGitHub();

  const handleFileClick = useCallback(
    async (path: string) => {
      setIsLoadingContent(true);
      setIsViewingContent(true);
      localStorage.setItem("shadowbox_last_viewed_path", path);
      try {
        const res = await fetch(terminalCommandPath(sandboxId), {
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
    [sandboxId, runId, setIsLoadingContent, setIsViewingContent, setSelectedFile],
  );

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
    [repo, branch, setIsLoadingContent, setIsViewingContent, setSelectedFile],
  );

  return {
    handleFileClick,
    handleGitHubFileSelect,
  };
}
