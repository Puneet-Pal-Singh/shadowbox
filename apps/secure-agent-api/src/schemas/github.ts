import type { ToolDefinition } from "../interfaces/types";

export const GitHubTools: ToolDefinition[] = [
  {
    name: "github_pr_list",
    description:
      "List pull requests for a repository, optionally filtered by state and head branch.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        state: {
          type: "string",
          description: "Pull request state (open, closed, all)",
        },
        head: {
          type: "string",
          description:
            "Head branch filter. For same-repo branches, pass only the branch name.",
        },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_pr_get",
    description: "Get remote metadata for a GitHub pull request.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        number: { type: "number", description: "Pull request number" },
      },
      required: ["owner", "repo", "number"],
    },
  },
  {
    name: "github_pr_checks_get",
    description: "Get check runs for a pull request head commit.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        number: { type: "number", description: "Pull request number" },
      },
      required: ["owner", "repo", "number"],
    },
  },
  {
    name: "github_review_threads_get",
    description: "Get review-thread-like pull request comment groupings.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        number: { type: "number", description: "Pull request number" },
      },
      required: ["owner", "repo", "number"],
    },
  },
  {
    name: "github_issue_get",
    description: "Get remote metadata for a GitHub issue.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        number: { type: "number", description: "Issue number" },
      },
      required: ["owner", "repo", "number"],
    },
  },
  {
    name: "github_actions_run_get",
    description: "Get metadata for a GitHub Actions workflow run.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        actionsRunId: { type: "number", description: "Workflow run id" },
      },
      required: ["owner", "repo", "actionsRunId"],
    },
  },
];
