import { X, Code2, Copy } from "lucide-react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
// import { cn } from "../../lib/utils";

interface ArtifactViewProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  language?: string;
}

export function ArtifactView({ isOpen, onClose, title, content, language = 'typescript' }: ArtifactViewProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[50vw] bg-background border-l border-zinc-800 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out">
      {/* Header */}
      <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <Code2 size={16} className="text-emerald-500" />
          <span>{title}</span>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* Code Editor View */}
      <div className="flex-1 overflow-auto relative bg-[#1e1e1e]">
         <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: '1.5rem',
              fontSize: '14px',
              lineHeight: '1.6',
              background: 'transparent'
            }}
            showLineNumbers={true}
          >
            {content}
          </SyntaxHighlighter>
      </div>

      {/* Footer Actions */}
      <div className="h-12 border-t border-zinc-800 bg-zinc-900 flex items-center justify-end px-4 gap-2">
        <button 
          onClick={() => navigator.clipboard.writeText(content)}
          className="text-xs flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          <Copy size={12} /> Copy Code
        </button>
      </div>
    </div>
  );
}