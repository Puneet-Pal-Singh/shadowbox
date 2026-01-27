import { CheckCircle2, CircleDashed, XCircle, Terminal } from 'lucide-react';
import { ActionStatus } from '../../types/chat';

interface ActionBlockProps {
  tool: string;
  status: ActionStatus;
}

export function ActionBlock({ tool, status }: ActionBlockProps) {
  const config = {
    running: { icon: <CircleDashed className="animate-spin text-blue-400" size={14} />, text: 'Executing' },
    success: { icon: <CheckCircle2 className="text-accent" size={14} />, text: 'Completed' },
    error: { icon: <XCircle className="text-red-500" size={14} />, text: 'Failed' },
  };

  return (
    <div className="flex items-center gap-3 bg-[#0c0c0e] border border-zinc-800 rounded-md px-3 py-2 my-2 transition-all hover:border-zinc-700">
      <div className="flex items-center justify-center">
        {config[status].icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
          {config[status].text}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Terminal size={10} className="text-zinc-400" />
          <span className="text-xs font-mono text-zinc-200">{tool}</span>
        </div>
      </div>
    </div>
  );
}