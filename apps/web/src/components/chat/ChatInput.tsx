import { useState, KeyboardEvent } from 'react';
import { Send, Settings } from 'lucide-react';

interface ChatInputProps {
  onSend: (msg: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (input.trim()) {
      onSend(input);
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 bg-[#0c0c0e] border-t border-zinc-800">
      <div className="relative flex items-end gap-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 focus-within:border-zinc-700 transition-colors">
        <button className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors">
          <Settings size={18} />
        </button>
        
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask Shadowbox to write code..."
          className="flex-1 bg-transparent border-none focus:ring-0 resize-none text-sm text-zinc-200 placeholder-zinc-600 h-10 py-2.5 max-h-32"
          rows={1}
        />
        
        <button 
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="p-2 bg-white text-black rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Send size={16} />
        </button>
      </div>
      <div className="text-[10px] text-zinc-600 mt-2 text-center">
        AI Agents can make mistakes. Review generated code.
      </div>
    </div>
  );
}