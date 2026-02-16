/**
 * WorkspaceHeader Component
 * Displays workspace information: current session name and repository.
 */

import { GitBranch } from "lucide-react";

interface WorkspaceHeaderProps {
  sessionName?: string;
  repository?: string;
}

export function WorkspaceHeader({
  sessionName,
  repository,
}: WorkspaceHeaderProps) {
  return (
    <div className="h-12 bg-zinc-900 border-b border-zinc-800 px-4 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {sessionName && (
          <h1 className="text-sm font-medium text-zinc-200 truncate">
            {sessionName}
          </h1>
        )}
        {repository && (
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <GitBranch className="w-3 h-3" />
            <span className="truncate">{repository}</span>
          </div>
        )}
      </div>
      {!sessionName && !repository && (
        <p className="text-sm text-zinc-600 italic">No session selected</p>
      )}
    </div>
  );
}
