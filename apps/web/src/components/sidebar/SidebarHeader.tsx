import { GitCommit, Folder, X, Maximize2 } from "lucide-react";

interface SidebarHeaderProps {
  activeTab: "changes" | "files";
  onTabChange: (tab: "changes" | "files") => void;
  onClose: () => void;
  onExpand: () => void;
  changesCount?: number;
}

export function SidebarHeader({
  activeTab,
  onTabChange,
  onClose,
  onExpand,
  changesCount = 0,
}: SidebarHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3 bg-gray-900">
      <div className="flex gap-1">
        <button
          onClick={() => onTabChange("changes")}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t transition-colors border-b-2 ${
            activeTab === "changes"
              ? "text-white border-b-emerald-500 bg-gray-800"
              : "text-gray-400 border-b-transparent hover:text-gray-300"
          }`}
        >
          <GitCommit size={16} />
          Changes
          {changesCount > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-emerald-600 rounded-full text-xs">
              {changesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onTabChange("files")}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t transition-colors border-b-2 ${
            activeTab === "files"
              ? "text-white border-b-emerald-500 bg-gray-800"
              : "text-gray-400 border-b-transparent hover:text-gray-300"
          }`}
        >
          <Folder size={16} />
          Files
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onExpand}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-300"
          title="Expand to full screen"
        >
          <Maximize2 size={16} />
        </button>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-300"
          title="Close sidebar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
