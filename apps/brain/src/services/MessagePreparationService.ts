import { convertToCoreMessages, type CoreMessage, type Message } from "ai";

export interface PreparedMessages {
  coreMessages: CoreMessage[];
  messagesForAI: CoreMessage[];
  lastUserMessage: CoreMessage | null;
  isNewRun: boolean;
}

export class MessagePreparationService {
  prepareMessages(rawMessages: Message[]): PreparedMessages {
    const coreMessages = convertToCoreMessages(rawMessages);
    const isNewRun = coreMessages.length <= 1;
    const lastUserMessage = this.extractLastUserMessage(coreMessages);

    // For new runs, use all messages. For existing, slice and prepare
    const messagesForAI = isNewRun
      ? coreMessages
      : this.prepareExistingContext(coreMessages);

    return {
      coreMessages,
      messagesForAI,
      lastUserMessage,
      isNewRun,
    };
  }

  private extractLastUserMessage(messages: CoreMessage[]): CoreMessage | null {
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.role === "user" ? lastMessage : null;
  }

  private prepareExistingContext(messages: CoreMessage[]): CoreMessage[] {
    // Keep only last 15 messages for context window
    return messages.length > 15 ? messages.slice(-15) : messages;
  }
}
