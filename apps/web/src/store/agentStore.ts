import type { Message } from "@ai-sdk/react";

class AgentStore {
  private messagesMap: Map<string, Message[]> = new Map();

  getMessages(runId: string): Message[] {
    return this.messagesMap.get(runId) || [];
  }

  setMessages(runId: string, messages: Message[]) {
    this.messagesMap.set(runId, messages);
  }

  clearMessages(runId: string) {
    this.messagesMap.delete(runId);
  }

  clearAllMessages() {
    this.messagesMap.clear();
  }
}

export const agentStore = new AgentStore();
