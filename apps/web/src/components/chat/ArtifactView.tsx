import { X } from 'lucide-react';

export function ArtifactView({ code, fileName, onClose }: { code: string, fileName: string, onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 w-125 bg-surface border-l border-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <span className="text-xs font-mono text-zinc-400">{fileName}</span>
        <button onClick={onClose} className="hover:bg-zinc-800 p-1 rounded"><X size={16}/></button>
      </div>
      <pre className="flex-1 p-4 text-xs font-mono overflow-auto bg-black text-zinc-300">
        <code>{code}</code>
      </pre>
      <div className="p-4 border-t border-border bg-zinc-900/50">
        <button className="w-full py-2 bg-accent text-black font-bold text-xs rounded-md">
          Commit Changes
        </button>
      </div>
    </div>
  );
}