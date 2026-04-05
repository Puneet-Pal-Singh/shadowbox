import type {
  GitStatusResponse,
  GitToolActivityMetadata,
} from "@repo/shared-types";
import type { ToolActivityPart } from "@repo/shared-types";

export function getGitCommandLabel(item: ToolActivityPart): string {
  const metadata = item.metadata as GitToolActivityMetadata;
  switch (item.toolName) {
    case "git_status":
      return "git status";
    case "git_diff": {
      const path = typeof metadata.path === "string" ? metadata.path : "";
      return path ? `git diff -- ${path}` : "git diff";
    }
    case "git_create_pull_request":
      return "create pull request";
    case "git_pull":
      return "git pull --ff-only";
    default:
      return item.toolName
        .split(/[_-]/g)
        .filter(Boolean)
        .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
        .join(" ");
  }
}

export function getGitSummary(item: ToolActivityPart): string {
  const metadata = item.metadata as GitToolActivityMetadata;
  if (item.status === "failed") {
    return "Command failed";
  }

  if (item.status === "requested" || item.status === "running") {
    return "Running";
  }

  if (item.toolName === "git_status") {
    const parsed = parseGitStatusPreview(metadata.preview);
    if (!parsed) {
      return "";
    }

    if (!parsed.gitAvailable) {
      return "Git unavailable";
    }

    const summaryParts: string[] = [];
    if (parsed.branch) {
      summaryParts.push(`On ${parsed.branch}`);
    }

    summaryParts.push(
      parsed.hasStaged || parsed.hasUnstaged
        ? "working tree dirty"
        : "working tree clean",
    );

    if (parsed.ahead > 0) {
      summaryParts.push(`ahead ${parsed.ahead}`);
    }

    if (parsed.behind > 0) {
      summaryParts.push(`behind ${parsed.behind}`);
    }

    return summaryParts.join(" · ");
  }

  if (item.toolName === "git_create_pull_request") {
    return "Pull request created";
  }

  if (item.toolName === "git_pull") {
    return "Branch synced";
  }

  return metadata.count ? `${metadata.count} changed lines` : "";
}

export function getGitDetails(item: ToolActivityPart): string[] {
  const metadata = item.metadata as GitToolActivityMetadata;
  if (item.toolName === "git_status") {
    const parsed = parseGitStatusPreview(metadata.preview);
    if (parsed) {
      return [formatGitStatusTranscript(parsed)];
    }
  }

  if (!metadata.preview) {
    return [];
  }

  const commandLabel = getGitCommandLabel(item);
  return [`$ ${commandLabel}\n\n${metadata.preview}`];
}

function parseGitStatusPreview(
  preview: string | undefined,
): GitStatusResponse | null {
  if (!preview?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(preview) as unknown;
    if (!isGitStatusResponse(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function formatGitStatusTranscript(status: GitStatusResponse): string {
  const lines = ["$ git status"];

  if (!status.gitAvailable) {
    lines.push("", "Git is unavailable in the current workspace.");
    return lines.join("\n");
  }

  lines.push("", `On branch ${status.branch || "unknown"}`);

  if (status.hasStaged || status.hasUnstaged) {
    lines.push("Working tree has local changes.");
  } else {
    lines.push("Working tree clean.");
  }

  if (status.ahead > 0 || status.behind > 0) {
    const trackingParts: string[] = [];
    if (status.ahead > 0) {
      trackingParts.push(`ahead ${status.ahead}`);
    }
    if (status.behind > 0) {
      trackingParts.push(`behind ${status.behind}`);
    }
    lines.push(`Tracking status: ${trackingParts.join(", ")}.`);
  }

  if (status.files.length > 0) {
    lines.push("", "Changed files:");
    for (const file of status.files.slice(0, 8)) {
      lines.push(`- ${file.path} (${file.status})`);
    }
  }

  return lines.join("\n");
}

function isGitStatusResponse(value: unknown): value is GitStatusResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const files = candidate.files;

  return (
    Array.isArray(files) &&
    files.every((file: unknown) => {
      if (typeof file !== "object" || file === null) {
        return false;
      }

      const fileCandidate = file as Record<string, unknown>;
      return (
        typeof fileCandidate.path === "string" &&
        typeof fileCandidate.status === "string"
      );
    }) &&
    typeof candidate.ahead === "number" &&
    typeof candidate.behind === "number" &&
    typeof candidate.branch === "string" &&
    ("repoIdentity" in candidate
      ? candidate.repoIdentity === null ||
        typeof candidate.repoIdentity === "string"
      : true) &&
    typeof candidate.hasStaged === "boolean" &&
    typeof candidate.hasUnstaged === "boolean" &&
    typeof candidate.gitAvailable === "boolean"
  );
}
