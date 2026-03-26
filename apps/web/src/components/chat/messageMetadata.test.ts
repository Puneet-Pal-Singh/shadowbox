import { describe, expect, it } from "vitest";
import type { Message } from "@ai-sdk/react";
import { buildConversationTurns } from "./messageMetadata.js";

describe("messageMetadata", () => {
  it("builds conversation turns from actual message identities", () => {
    const turns = buildConversationTurns([
      {
        id: "user-1",
        role: "user",
        content: "hey",
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "Hello! How can I help you today?",
      },
      {
        id: "user-2",
        role: "user",
        content: "hey",
      },
      {
        id: "assistant-2",
        role: "assistant",
        content: "I read the README and summarized it.",
      },
    ] satisfies Message[]);

    expect(turns).toHaveLength(2);
    expect(turns[0]?.key).toBe("user-1");
    expect(turns[0]?.userMessage?.id).toBe("user-1");
    expect(turns[0]?.assistantMessage?.id).toBe("assistant-1");
    expect(turns[1]?.key).toBe("user-2");
    expect(turns[1]?.userMessage?.id).toBe("user-2");
    expect(turns[1]?.assistantMessage?.id).toBe("assistant-2");
  });
});
