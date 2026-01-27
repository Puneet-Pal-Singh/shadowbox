import { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useChat } from '../../hooks/useChat';
import { Bot } from 'lucide-react';

export function ChatInterface({ sessionId }: { sessionId: string }) {
  const { messages, isLoading, sendMessage } = useChat(sessionId);
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
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>

      {/* Input Layer */}
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}