import { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { Bot, Send, Settings } from 'lucide-react';
import { Message } from 'ai';

interface ChatInterfaceProps {
  chatProps: {
    messages: Message[];
    input: string;
    handleInputChange: (e: any) => void;
    handleSubmit: (e?: any) => void;
    isLoading: boolean;
  };
  onArtifactOpen?: (path: string, content: string) => void;
}

export function ChatInterface({ chatProps, onArtifactOpen }: ChatInterfaceProps) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = chatProps;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Scrollable Container */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-20">
            <Bot size={48} className="mb-4 text-accent" />
            <span className="font-mono text-xs tracking-widest uppercase">Awaiting Task Parameters</span>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage 
            key={msg.id} 
            message={msg} 
            onArtifactOpen={onArtifactOpen}
          />
        ))}
      </div>

      {/* Input Layer */}
      <div className="p-4 bg-[#0c0c0e] border-t border-zinc-800">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }} 
          className="relative flex items-end gap-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 focus-within:border-zinc-700 transition-colors"
        >
          <button type="button" className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors">
            <Settings size={18} />
          </button>
          
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={isLoading}
            placeholder="Ask Shadowbox to write code..."
            className="flex-1 bg-transparent border-none focus:ring-0 resize-none text-sm text-zinc-200 placeholder-zinc-600 h-10 py-2.5 max-h-32"
            rows={1}
          />
          
          <button 
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-2 bg-white text-black rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Send size={16} />
          </button>
        </form>
        <div className="text-[10px] text-zinc-600 mt-2 text-center">
          AI Agents can make mistakes. Review generated code.
        </div>
      </div>
    </div>
  );
}
