import { X, Code2, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ArtifactViewProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  language?: string;
}

export function ArtifactView({ isOpen, onClose, title, content, language }: ArtifactViewProps) {
  const [copied, setCopied] = useState(false);
  
  if (!isOpen) return null;

  // Better language detection
  const getLanguage = (filename: string) => {
    if (language) return language;
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx': return 'javascript';
      case 'ts':
      case 'tsx': return 'typescript';
      case 'py': return 'python';
      case 'rs': return 'rust';
      case 'go': return 'go';
      case 'md': return 'markdown';
      case 'json': return 'json';
      case 'css': return 'css';
      case 'html': return 'html';
      default: return 'typescript';
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[60vw] bg-background border-l border-border shadow-2xl z-[100] flex flex-col transform transition-transform duration-300 ease-in-out">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-zinc-900/50 backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <Code2 size={16} className="text-emerald-500" />
          <span className="font-mono text-xs">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleCopy}
            className="p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
            title="Copy Code"
          >
            {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
          </button>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Code Editor View */}
      <div className="flex-1 overflow-auto bg-[#1e1e1e] scrollbar-hide">
        <SyntaxHighlighter
          language={getLanguage(title)}
          style={vscDarkPlus}
          PreTag="div"
          showLineNumbers={true}
          customStyle={{
            margin: 0,
            width: '100%',
            background: 'transparent',
            padding: '1.5rem',
            fontSize: '13px',
            fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
          }}
          codeTagProps={{
            style: {
              background: 'transparent',
            }
          }}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
