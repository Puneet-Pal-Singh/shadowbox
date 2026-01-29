import { Maximize2, FileCode } from "lucide-react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from "../../lib/utils";

interface ArtifactPreviewProps {
  title: string;
  content: string;
  onOpen: () => void;
  status: 'submitted' | 'call' | 'result' | 'partial-call';
}

export function ArtifactPreview({ title, content, onOpen, status }: ArtifactPreviewProps) {
  const isRunning = status === 'call' || status === 'partial-call';

  return (
    <div className={cn(
      "w-full max-w-xl my-4 rounded-xl border bg-zinc-900/50 overflow-hidden transition-all shadow-lg",
      isRunning ? "border-zinc-800 opacity-70" : "border-zinc-800 hover:border-zinc-700"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-zinc-800">
        <div className="flex items-center gap-2 overflow-hidden">
          <FileCode size={14} className="text-emerald-500 shrink-0" />
          <span className="text-[11px] font-mono text-zinc-300 truncate">{title}</span>
        </div>
        {!isRunning && (
          <button 
            onClick={onOpen}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Open Full View"
          >
            <Maximize2 size={12} />
          </button>
        )}
      </div>

      {/* Code Glimpse */}
      <div className="relative max-h-48 overflow-hidden group">
        <SyntaxHighlighter
          language={title.split('.').pop() || 'typescript'}
          style={vscDarkPlus}
          PreTag="div"
          showLineNumbers={true}
          customStyle={{
            margin: 0,
            width: '100%',
            background: 'transparent',
            padding: '1rem',
            fontSize: '11px',
            fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
          }}
        >
          {content}
        </SyntaxHighlighter>
        
        {/* Fade overlay for long code */}
        {!isRunning && content.split('\n').length > 10 && (
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-zinc-950/80 to-transparent flex items-end justify-center pb-2">
            <button 
              onClick={onOpen}
              className="text-[10px] font-bold text-zinc-400 hover:text-white uppercase tracking-wider bg-zinc-900/80 px-3 py-1 rounded-full border border-zinc-800 backdrop-blur-sm"
            >
              Show Full File
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
