import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Message } from "@ai-sdk/react";
import { ChatMessage } from "./ChatMessage";

describe("ChatMessage", () => {
  it("renders assistant content as markdown", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      content: "**Final Report**\n\n- item one\n- item two",
    } as Message;

    const { container } = render(<ChatMessage message={message} />);

    expect(screen.getByText("Final Report").tagName).toBe("STRONG");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(screen.queryByText("**Final Report**")).not.toBeInTheDocument();
  });

  it("renders user content as markdown", () => {
    const message = {
      id: "user-1",
      role: "user",
      content: "Use `docs/` and [README](https://example.com)",
    } as Message;

    render(<ChatMessage message={message} />);

    expect(screen.getByText("docs/").tagName).toBe("CODE");
    const link = screen.getByRole("link", { name: "README" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("shows only the basename for user file mentions", () => {
    const message = {
      id: "user-mention",
      role: "user",
      content: "add logging to @src/components/dashboard/admin/pending-approvals/PendingJobCard.tsx",
    } as Message;

    render(<ChatMessage message={message} />);

    expect(screen.getByText(/@PendingJobCard\.tsx/)).toBeInTheDocument();
    expect(
      screen.queryByText(/@src\/components\/dashboard\/admin\/pending-approvals\/PendingJobCard\.tsx/),
    ).not.toBeInTheDocument();
  });

  it("does not rewrite code spans or markdown links when shortening mentions", () => {
    const message = {
      id: "user-markdown-mention",
      role: "user",
      content:
        'check `@src/components/dashboard/admin/pending-approvals/PendingJobCard.tsx` and [docs](https://example.com/@repo/shared-types) plus @"docs/API Guide.md"',
    } as Message;

    render(<ChatMessage message={message} />);

    expect(
      screen.getByText(
        "@src/components/dashboard/admin/pending-approvals/PendingJobCard.tsx",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://example.com/@repo/shared-types",
    );
    expect(screen.getByText(/@API Guide\.md/)).toBeInTheDocument();
  });

  it("does not render markdown images", () => {
    const message = {
      id: "assistant-image",
      role: "assistant",
      content: "![remote](https://example.com/remote.png)",
    } as Message;

    const { container } = render(<ChatMessage message={message} />);

    expect(container.querySelector("img")).toBeNull();
  });
});
