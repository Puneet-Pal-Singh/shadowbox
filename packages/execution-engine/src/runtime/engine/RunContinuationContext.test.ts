import { describe, expect, it } from "vitest";
import { Run } from "../run/index.js";
import {
  buildAgenticLoopWorkspaceContext,
  createRunContinuationState,
} from "./RunContinuationContext.js";

describe("RunContinuationContext", () => {
  it("captures completed edits and the last failure from a finished run", () => {
    const run = new Run("run-1", "session-1", "COMPLETED", "coding", {
      agentType: "coding",
      prompt: "make the hero prettier",
      sessionId: "session-1",
    });
    run.output = {
      content: "The hero cards were added, but the git commit step failed.",
    };
    run.metadata.agenticLoop = {
      enabled: true,
      stopReason: "tool_error",
      toolLifecycle: [
        {
          toolCallId: "tool-1",
          toolName: "write_file",
          status: "completed",
          mutating: true,
          recordedAt: new Date().toISOString(),
          metadata: {
            family: "edit",
            filePath: "src/components/Hero.tsx",
            additions: 20,
            deletions: 3,
          },
        },
        {
          toolCallId: "tool-1b",
          toolName: "git_branch_create",
          status: "completed",
          mutating: true,
          recordedAt: new Date().toISOString(),
          detail: "Created and switched to feat/floating-hero-carousels",
          metadata: {
            family: "git",
            displayText: "Creating branch",
            pluginLabel: "GitHub",
            preview: "feat/floating-hero-carousels",
          },
        },
        {
          toolCallId: "tool-2",
          toolName: "bash",
          status: "failed",
          mutating: true,
          recordedAt: new Date().toISOString(),
          detail: "Invalid command argument: multiline values are not allowed",
          metadata: {
            family: "shell",
            command: 'git commit -m "feat: add hero\n\nbody"',
            origin: "agent_tool",
            truncated: false,
          },
        },
      ],
    };

    const continuation = createRunContinuationState(run);

    expect(continuation).toMatchObject({
      previousPrompt: "make the hero prettier",
      previousStopReason: "tool_error",
      completedFiles: ["src/components/Hero.tsx"],
      completedGitSteps: ["Branch created: feat/floating-hero-carousels"],
      activeBranch: "feat/floating-hero-carousels",
      failedToolName: "bash",
    });
  });

  it("adds explicit resume guidance for short continuation prompts", () => {
    const workspaceContext = buildAgenticLoopWorkspaceContext({
      repositoryContext: {
        owner: "acme",
        repo: "career-crew",
        branch: "main",
      },
      prompt: "continue?",
      continuation: {
        previousPrompt: "add floating carousels and commit the changes",
        previousOutput:
          "I couldn't finish the git step in the sandbox. Retry the step or run it locally.",
        previousStopReason: "tool_error",
        completedFiles: ["src/components/landing/hero/FloatingCarousels.tsx"],
        completedGitSteps: [
          "Branch created: feat/floating-hero-carousels",
          "Commit created: feat: add floating carousels to hero section",
        ],
        activeBranch: "feat/floating-hero-carousels",
        failedToolName: "bash",
        failedToolDetail:
          "Invalid command argument: multiline values are not allowed",
        failedCommand:
          'git add src/components/landing/hero/FloatingCarousels.tsx && git commit -m "feat: add floating carousels\n\nbody"',
        recordedAt: new Date().toISOString(),
      },
    });

    expect(workspaceContext).toContain("Continuation context:");
    expect(workspaceContext).toContain(
      "Files already changed in the workspace: src/components/landing/hero/FloatingCarousels.tsx",
    );
    expect(workspaceContext).toContain(
      "Git progress already completed in this workspace:",
    );
    expect(workspaceContext).toContain(
      "Resume on branch: feat/floating-hero-carousels",
    );
    expect(workspaceContext).toContain(
      "Prefer shell/bash for local git recovery by default. Use typed git tools only when they simplify a structured step like stage/commit/push.",
    );
  });

  it("adds PR-specific recovery guidance when gh pr create failed through bash", () => {
    const workspaceContext = buildAgenticLoopWorkspaceContext({
      prompt: "continue?",
      continuation: {
        previousPrompt: "commit, push, and open a PR",
        previousStopReason: "tool_error",
        previousOutput:
          "The branch was pushed, but the PR step failed before GitHub accepted it.",
        completedFiles: ["src/components/landing/hero/FloatingCarousels.tsx"],
        completedGitSteps: [
          "Branch created: feat/floating-hero-carousels",
          "Commit created: feat: add floating carousels to hero section",
          "Branch pushed: feat/floating-hero-carousels",
        ],
        failedToolName: "bash",
        failedToolDetail:
          "Invalid arguments for tool bash: command exceeded the maximum length",
        failedCommand:
          'gh pr create --base main --head feat/floating-hero-carousels --title "feat: add floating carousels to hero section" --body "too much text"',
        recordedAt: new Date().toISOString(),
      },
    });

    expect(workspaceContext).toContain(
      "For pull-request metadata and checks, prefer connector reads first. If connector coverage is missing, retry with a shorter gh command through shell.",
    );
    expect(workspaceContext).toContain(
      "Branch pushed: feat/floating-hero-carousels",
    );
    expect(workspaceContext).toContain(
      "Do not repeat successful inspection or rewrite already-updated files unless the current workspace proves the change is missing.",
    );
  });

  it("treats failed non-fast-forward pushes as committed local progress", () => {
    const workspaceContext = buildAgenticLoopWorkspaceContext({
      prompt: "continue?",
      continuation: {
        previousPrompt: "commit, push, and open a PR",
        previousStopReason: "tool_error",
        previousOutput:
          "Push failed because the remote branch had newer commits.",
        completedFiles: [
          "src/components/landing/hero/FloatingCarousels.tsx",
          "src/components/landing/hero/index.tsx",
        ],
        completedGitSteps: [
          "Branch created: feat/floating-hero-carousels",
          "Commit created: feat: add floating carousels to hero section",
        ],
        failedToolName: "git_push",
        failedToolDetail:
          "Push failed because origin/feat/floating-hero-carousels already has newer commits. Your file changes are already committed locally.",
        recordedAt: new Date().toISOString(),
      },
    });

    expect(workspaceContext).toContain(
      "The previous push failed after the changes were already committed locally. A clean working tree does not mean the edits were lost.",
    );
    expect(workspaceContext).toContain(
      "Do not recreate or recommit files. Sync the branch with git_pull and retry git_push.",
    );
  });

  it("includes bootstrap readiness and git strategy hints in workspace context", () => {
    const workspaceContext = buildAgenticLoopWorkspaceContext({
      prompt: "inspect PR 228 checks and fix failing tests",
      workspaceBootstrap: {
        requested: true,
        ready: true,
        status: "ready",
        mode: "git_write",
        blocked: false,
        expectedMiss: false,
        recordedAt: new Date().toISOString(),
      },
      gitTaskStrategy: {
        classification: "hybrid_pr_ci",
        preferredLane: "github_connector",
        fallbackLane: "shell_git",
        rationale:
          "Hybrid PR/CI flow should start with connector metadata and continue with shell-first local repair.",
        recordedAt: new Date().toISOString(),
      },
    });

    expect(workspaceContext).toContain(
      "Workspace bootstrap state: ready (status=ready, mode=git_write).",
    );
    expect(workspaceContext).toContain(
      "Git/GitHub strategy hint: hybrid_pr_ci -> github_connector (fallback: shell_git).",
    );
    expect(workspaceContext).toContain("Strategy rationale:");
  });
});
