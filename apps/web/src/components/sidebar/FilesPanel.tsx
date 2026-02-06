import { memo } from "react";
import FileExplorer from "../FileExplorer";

interface FilesPanelProps {
  className?: string;
}

const FilesPanel = memo(({ className = "" }: FilesPanelProps) => {
  return (
    <div className={`h-full bg-gray-950 rounded-lg border border-gray-800 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-900">
        <h3 className="text-sm font-semibold text-white">Files</h3>
      </div>

      <div className="h-full overflow-auto">
        <FileExplorer />
      </div>
    </div>
  );
});

FilesPanel.displayName = "FilesPanel";

export default FilesPanel;
