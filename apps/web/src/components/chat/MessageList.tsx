import { User, Bot, Terminal } from 'lucide-react';
import { ChatMessage } from '../../types/chat';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {messages.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center opacity-20 select-none">
          <Bot size={64} className="mb-4 text-accent" />
          <p className="font-mono text-sm">INITIALIZE AGENT PROTOCOL</p>
        </div>
      )}

      {messages.map((msg) => (
        <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
          
          {/* Avatar */}
          <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 border ${
            msg.role === 'user' 
              ? 'bg-zinc-800 border-zinc-700 text-zinc-400' 
              : 'bg-accent/10 border-accent/20 text-accent'
          }`}>
            {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
          </div>

          {/* Bubble */}
          <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
            <div className={`rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user' 
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700' 
                : 'text-zinc-300'
            }`}>
              {msg.content}
            </div>

            {/* Tool Execution Results (If any) */}
            {msg.toolResults && msg.toolResults.length > 0 && (
              <div className="bg-[#0c0c0e] border border-zinc-800 rounded p-2 text-xs font-mono w-full">
                <div className="flex items-center gap-2 text-zinc-500 mb-2 border-b border-zinc-800 pb-1">
                  <Terminal size={12} />
                  <span>Automated Action</span>
                </div>
                {msg.toolResults.map((t, i) => (
                  <div key={i} className="mb-1">
                    <span className="text-blue-400">❯ {t.tool}</span>
                    <pre className="text-zinc-500 mt-1 overflow-x-auto">
                      {JSON.stringify(t.result, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {isLoading && (
        <div className="flex gap-4">
          <div className="w-8 h-8 rounded bg-accent/10 border border-accent/20 flex items-center justify-center">
            <div className="w-2 h-2 bg-accent rounded-full animate-ping" />
          </div>
          <div className="text-xs text-zinc-500 py-2">Thinking...</div>
        </div>
      )}
    </div>
  );
}