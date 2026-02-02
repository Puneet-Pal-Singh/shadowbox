import { Plus, X, Zap } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'framer-motion';
import { AgentSession } from '../../hooks/useSessionManager';

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
  const activeSessions = sessions.filter(s => s.status === 'running');
  const completedSessions = sessions.filter(s => s.status !== 'running');

  return (
    <aside className="w-64 border-r border-border flex flex-col bg-[#0c0c0e] overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tasks</h2>
          {activeSessions.length > 0 && (
            <motion.span 
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-[10px] text-emerald-400"
              animate={{ opacity: [0.6, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <Zap size={10} className="fill-current" />
              {activeSessions.length}
            </motion.span>
          )}
        </div>
        <motion.button 
          onClick={onCreate}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="p-1.5 hover:bg-surface rounded-lg text-zinc-300 transition-colors border border-transparent hover:border-border"
        >
          <Plus size={16} />
        </motion.button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="text-center mt-8 px-4">
            <p className="text-xs text-zinc-600 italic">No tasks yet</p>
            <p className="text-[10px] text-zinc-700 mt-2">Click the + button to create one</p>
          </div>
        ) : (
          <div className="p-2">
            {/* Active Tasks Section */}
            {activeSessions.length > 0 && (
              <div className="mb-4">
                <div className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-2">
                  Running ({activeSessions.length})
                </div>
                {activeSessions.map((s, idx) => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    isActive={activeSessionId === s.id}
                    onSelect={() => onSelect(s.id)}
                    onRemove={() => onRemove(s.id)}
                    delay={idx * 0.05}
                  />
                ))}
              </div>
            )}

            {/* Completed Tasks Section */}
            {completedSessions.length > 0 && (
              <div>
                <div className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-2">
                  Completed ({completedSessions.length})
                </div>
                {completedSessions.map((s, idx) => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    isActive={activeSessionId === s.id}
                    onSelect={() => onSelect(s.id)}
                    onRemove={() => onRemove(s.id)}
                    delay={activeSessions.length * 0.05 + idx * 0.05}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border text-[10px] text-zinc-600">
        <p>Version 1.0.0</p>
      </div>
    </aside>
  );
}

interface SessionItemProps {
  session: AgentSession;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  delay?: number;
}

function SessionItem({ session, isActive, onSelect, onRemove, delay = 0 }: SessionItemProps) {
  const getStatusDot = () => {
    switch (session.status) {
      case 'running':
        return (
          <motion.div
            className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        );
      case 'completed':
        return <div className="w-2 h-2 rounded-full bg-zinc-500" />;
      case 'error':
        return <div className="w-2 h-2 rounded-full bg-red-500" />;
      default:
        return <div className="w-2 h-2 rounded-full bg-zinc-600" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.2 }}
      onClick={onSelect}
      className={cn(
        "group flex items-center justify-between p-2.5 rounded-lg cursor-pointer mb-1.5 transition-all border",
        isActive
          ? "bg-zinc-800/40 text-white border-zinc-700/50"
          : "hover:bg-zinc-900/40 text-zinc-400 border-transparent hover:border-zinc-700/30"
      )}
    >
      <div className="flex items-center gap-2.5 overflow-hidden flex-1">
        {getStatusDot()}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{session.name}</p>
          <p className="text-[10px] text-zinc-600 truncate">
            {session.status === 'running' ? 'Running' : session.status === 'completed' ? 'Done' : session.status}
          </p>
        </div>
      </div>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
      >
        <X size={14} />
      </motion.button>
    </motion.div>
  );
}