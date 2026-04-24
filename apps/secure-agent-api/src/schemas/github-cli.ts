import type { ToolDefinition } from "../interfaces/types";

export const GitHubCliTools: ToolDefinition[] = [
  {
    name: "github_cli_pr_checks_get",
    description:
      "Get pull request check runs through the bounded GitHub CLI lane.",
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
    name: "github_cli_actions_run_get",
    description: "Get workflow run metadata through the bounded GitHub CLI lane.",
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
  {
    name: "github_cli_actions_job_logs_get",
    description:
      "Get trailing workflow job logs through the bounded GitHub CLI lane.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        actionsJobId: { type: "number", description: "Workflow job id" },
        tailLines: {
          type: "number",
          description:
            "Optional max number of trailing log lines to return (default: 300).",
        },
      },
      required: ["owner", "repo", "actionsJobId"],
    },
  },
  {
    name: "github_cli_pr_comment",
    description:
      "Create a pull request comment through the bounded GitHub CLI lane.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        number: { type: "number", description: "Pull request number" },
        body: { type: "string", description: "Comment body markdown/text" },
      },
      required: ["owner", "repo", "number", "body"],
    },
  },
];
