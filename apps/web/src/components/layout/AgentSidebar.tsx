import { Plus, X, Terminal as TerminalIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AgentSession } from '../../hooks/useSessionManager'; // Ensure this type is exported from hook

// Utility
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AgentSidebarProps {
  sessions: AgentSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRemove: (id: string) => void;
}

export function AgentSidebar({ sessions, activeSessionId, onSelect, onCreate, onRemove }: AgentSidebarProps) {
  return (
    <aside className="w-60 border-r border-border flex flex-col bg-background">
      <div className="p-4 flex items-center justify-between border-b border-border">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Agents</h2>
        <button 
          onClick={onCreate} 
          className="p-1 hover:bg-surface rounded text-zinc-300 transition-colors border border-transparent hover:border-border"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <div className="text-center mt-8 px-4">
            <p className="text-[10px] text-zinc-600 italic">No active agents.</p>
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={cn(
              "group flex items-center justify-between p-2 rounded-md cursor-pointer mb-1 transition-all",
              activeSessionId === s.id ? "bg-surface text-white border border-border" : "hover:bg-surface/50 text-zinc-500 border border-transparent"
            )}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <TerminalIcon size={12} className={activeSessionId === s.id ? "text-accent" : ""} />
              <span className="text-xs truncate">{s.name}</span>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); onRemove(s.id); }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}