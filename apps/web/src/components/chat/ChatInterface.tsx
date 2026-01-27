import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useChat } from '../../hooks/useChat';

interface ChatInterfaceProps {
  sessionId: string;
}

export function ChatInterface({ sessionId }: ChatInterfaceProps) {
  // The hook manages the state and API calls
  const { messages, isLoading, sendMessage } = useChat(sessionId);

  return (
    <div className="flex flex-col h-full bg-background text-zinc-300">
      {/* 1. History View */}
      <MessageList messages={messages} isLoading={isLoading} />
      
      {/* 2. Input Area */}
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}