import { User, Bot } from 'lucide-react';
import { ChatMessage as ChatMessageType } from '../../types/chat';
import { ActionBlock } from './ActionBlock';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''} group`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
        isUser ? 'bg-zinc-800 border-zinc-700' : 'bg-accent/10 border-accent/20'
      }`}>
        {isUser ? <User size={16} /> : <Bot size={16} className="text-accent" />}
      </div>

      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser ? 'bg-white text-black font-medium shadow-lg' : 'text-zinc-200'
        }`}>
          {message.content}
        </div>

        {/* Action Blocks (The "Muscle" feedback) */}
        {message.executions && message.executions.length > 0 && (
          <div className="w-full mt-2">
            {message.executions.map((exec, idx) => (
              <ActionBlock key={idx} tool={exec.tool} status={exec.status} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}