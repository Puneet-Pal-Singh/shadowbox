import { Message } from "ai";

class AgentStore {
  private messagesMap: Map<string, Message[]> = new Map();

  getMessages(agentId: string): Message[] {
    return this.messagesMap.get(agentId) || [];
  }

  setMessages(agentId: string, messages: Message[]) {
    this.messagesMap.set(agentId, messages);
  }

  clearMessages(agentId: string) {
    this.messagesMap.delete(agentId);
  }
}

export const agentStore = new AgentStore();
