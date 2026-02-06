import { memo } from "react";
import { useRunContext } from "../../hooks/useRunContext";
import { FileExplorer } from "../FileExplorer";

interface FilesPanelProps {
  className?: string;
  sessionId?: string;
  runId?: string;
}

const FilesPanel = memo(({ className = "", sessionId, runId }: FilesPanelProps) => {
  const context = useRunContext();
  const finalRunId = runId || context.runId;
  const finalSessionId = sessionId || finalRunId;

  return (
    <div className={`h-full flex flex-col bg-black ${className}`}>
      {finalRunId && finalSessionId ? (
        <FileExplorer
          sessionId={finalSessionId}
          runId={finalRunId}
          onFileClick={(path) => console.log("File clicked:", path)}
        />
      ) : (
        <div className="p-4 text-zinc-500 text-sm">No session available</div>
      )}
    </div>
  );
});

FilesPanel.displayName = "FilesPanel";

export default FilesPanel;
