import { User, Bot } from 'lucide-react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ChatMessage as ChatMessageType } from '../../types/chat';
import { ActionBlock } from './ActionBlock';

interface ChatMessageProps {
  message: ChatMessageType;
}

/**
 * SRP: Renders a single chat turn (User or Assistant)
 * Compliance: SOLID, No Any, DRY
 */
export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  // Strictly typed Markdown component overrides
  const markdownComponents: Components = {
    // Parameters are typed via react-markdown's internal Component types
  code(props) {
    const { children, className, ...rest } = props;
    
    // Look for "language-xxxx" in the className
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : undefined;

    // If it has a language match, render as a code block with highlighter
    if (language) {
        return (
        <div className="my-4 rounded-lg overflow-hidden border border-border">
            <div className="bg-surface px-4 py-1.5 border-b border-border flex justify-between items-center">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">
                {language}
            </span>
            </div>
            <SyntaxHighlighter
            style={vscDarkPlus}
            language={language}
            PreTag="div"
            customStyle={{ 
                margin: 0, 
                padding: '1rem', 
                fontSize: '13px', 
                background: '#000' 
            }}
            >
            {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
        </div>
        );
    }

    // Otherwise, render as inline code
    return (
        <code 
        className="bg-zinc-800 text-accent px-1.5 py-0.5 rounded text-xs font-mono" 
        {...rest}
        >
        {children}
        </code>
    );
    },
    
    // UI enhancements for standard markdown elements
    ul: ({ children }) => <ul className="list-disc ml-6 my-2 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal ml-6 my-2 space-y-1">{children}</ol>,
    p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>,
    a: ({ href, children }) => (
      <a 
        href={href} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="text-accent hover:underline"
      >
        {children}
      </a>
    ),
  };

  return (
    <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''} group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      {/* Avatar Section */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
        isUser 
          ? 'bg-zinc-800 border-zinc-700 text-zinc-400' 
          : 'bg-accent/10 border-accent/20 text-accent shadow-sm shadow-accent/5'
      }`}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Message Bubble Section */}
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm ${
          isUser 
            ? 'bg-white text-black font-medium shadow-md shadow-black/10' 
            : 'text-zinc-200 bg-transparent'
        }`}>
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]} 
            components={markdownComponents}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Action Logs (Execution results from Sandbox) */}
        {message.executions && message.executions.length > 0 && (
          <div className="w-full mt-3 space-y-1">
            {message.executions.map((exec, idx) => (
              <ActionBlock 
                key={`${message.id}-exec-${idx}`} 
                tool={exec.tool} 
                status={exec.status} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}