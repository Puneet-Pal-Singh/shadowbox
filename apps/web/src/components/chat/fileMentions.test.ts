import { describe, expect, it } from "vitest";
import {
  applyFileMention,
  filterFileMentionCandidates,
  findActiveFileMention,
} from "./fileMentions";

describe("fileMentions", () => {
  it("finds an active file mention at the caret", () => {
    expect(findActiveFileMention("check @src/compo", 16)).toEqual({
      start: 6,
      end: 16,
      query: "src/compo",
    });
  });

  it("ignores @ characters inside other words", () => {
    expect(findActiveFileMention("email@test.com", 14)).toBeNull();
  });

  it("replaces the active mention with a file path", () => {
    expect(
      applyFileMention(
        "inspect @rea please",
        { start: 8, end: 12, query: "rea" },
        "README.md",
      ),
    ).toEqual({
      nextValue: "inspect @README.md  please",
      nextCaret: 19,
    });
  });

  it("ranks closer file matches ahead of broader path matches", () => {
    expect(
      filterFileMentionCandidates(
        [
          "apps/web/src/components/chat/ChatInputBar.tsx",
          "README.md",
          "apps/web/src/components/chat/ChatMessage.tsx",
        ],
        "chati",
      ),
    ).toEqual(["apps/web/src/components/chat/ChatInputBar.tsx"]);
  });
});
