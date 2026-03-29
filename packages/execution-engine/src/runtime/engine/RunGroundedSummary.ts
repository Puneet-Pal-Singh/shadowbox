import type { SerializedTask } from "../types.js";
import { detectsMutation } from "./detectsMutation.js";

interface TaskSections {
  completed: SerializedTask[];
  failed: SerializedTask[];
  pending: SerializedTask[];
}

export interface GroundedCompletionAudit {
  requestedMutation: boolean;
  completedMutatingTaskCount: number;
  missingMutationEvidence: boolean;
}

export interface GroundedTaskSummary {
  evidencePrompt: string;
  fallbackSummary: string;
  sections: TaskSections;
  audit: GroundedCompletionAudit;
  missingMutationSummary: string | null;
}

export function buildGroundedTaskSummary(
  originalPrompt: string,
  tasks: SerializedTask[],
): GroundedTaskSummary {
  const sections = partitionTasks(tasks);
  const audit = buildCompletionAudit(originalPrompt, tasks);
  const evidencePrompt = [
    `Original Request: ${originalPrompt}`,
    "",
    "Completion Audit:",
    `- mutation requested: ${audit.requestedMutation ? "yes" : "no"}`,
    `- completed mutating tasks: ${audit.completedMutatingTaskCount}`,
    `- missing mutation evidence: ${audit.missingMutationEvidence ? "yes" : "no"}`,
    "",
    "Execution Evidence:",
    formatSection("Completed", sections.completed, formatCompletedTask),
    formatSection("Failed", sections.failed, formatFailedTask),
    formatSection("Pending", sections.pending, formatPendingTask),
    "",
    "Rules:",
    "- summarize only from the evidence above",
    "- do not claim work is complete if Failed or Pending sections are non-empty",
    "- do not claim a file/code change was completed unless completed mutating task evidence exists",
    "- mention failures and pending work explicitly when they exist",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  const fallbackSummary = [
    "## Summary",
    "",
    `Request: ${originalPrompt}`,
    "",
    formatSection("Completed", sections.completed, formatCompletedTask),
    formatSection("Failed", sections.failed, formatFailedTask),
    formatSection("Pending", sections.pending, formatPendingTask),
  ]
    .filter((line) => line.length > 0)
    .join("\n");
  const missingMutationSummary = audit.missingMutationEvidence
    ? buildMissingMutationSummary(originalPrompt, sections)
    : null;

  return {
    evidencePrompt,
    fallbackSummary,
    sections,
    audit,
    missingMutationSummary,
  };
}

function partitionTasks(tasks: SerializedTask[]): TaskSections {
  return {
    completed: tasks.filter((task) => task.status === "DONE"),
    failed: tasks.filter((task) => task.status === "FAILED"),
    pending: tasks.filter((task) =>
      ["PENDING", "READY", "RUNNING", "BLOCKED", "CANCELLED", "RETRYING"].includes(
        task.status,
      ),
    ),
  };
}

function formatSection(
  title: string,
  tasks: SerializedTask[],
  formatter: (task: SerializedTask) => string,
): string {
  if (tasks.length === 0) {
    return `${title}:\n- None`;
  }

  return `${title}:\n${tasks.map((task) => formatter(task)).join("\n")}`;
}

function formatCompletedTask(task: SerializedTask): string {
  return `- ${task.input.description}: ${formatTaskEvidence(task)}`;
}

function formatFailedTask(task: SerializedTask): string {
  return `- ${task.input.description}: ${formatDetail(
    task.error?.message ?? "Failed with no recorded error.",
  )}`;
}

function formatPendingTask(task: SerializedTask): string {
  return `- ${task.input.description}: status ${task.status.toLowerCase()}`;
}

function formatDetail(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function buildCompletionAudit(
  originalPrompt: string,
  tasks: SerializedTask[],
): GroundedCompletionAudit {
  const requestedMutation = promptRequestsMutation(originalPrompt);
  const completedMutatingTaskCount = tasks.filter(
    (task) => task.status === "DONE" && isMutatingTask(task),
  ).length;

  return {
    requestedMutation,
    completedMutatingTaskCount,
    missingMutationEvidence:
      requestedMutation && completedMutatingTaskCount === 0,
  };
}

function buildMissingMutationSummary(
  originalPrompt: string,
  sections: TaskSections,
): string {
  const completedEvidence =
    sections.completed.length > 0
      ? sections.completed
          .map((task) => `- ${task.input.description}: ${formatTaskEvidence(task)}`)
          .join("\n")
      : "- No completed tasks were recorded.";
  const failedEvidence =
    sections.failed.length > 0
      ? sections.failed
          .map((task) => `- ${task.input.description}: ${formatDetail(
            task.error?.message ?? "Failed with no recorded error.",
          )}`)
          .join("\n")
      : "- None";
  const pendingEvidence =
    sections.pending.length > 0
      ? sections.pending
          .map((task) => `- ${task.input.description}: status ${task.status.toLowerCase()}`)
          .join("\n")
      : "- None";

  return [
    "I'm not done with that change yet.",
    "The request asked for a code or file modification, but this run did not record any successful edit/write task.",
    "What completed so far:",
    completedEvidence,
    "What failed:",
    failedEvidence,
    "What is still pending:",
    pendingEvidence,
    "Please continue the edit before reporting success.",
    `Original request: ${originalPrompt}`,
  ].join("\n");
}

function promptRequestsMutation(originalPrompt: string): boolean {
  return detectsMutation(originalPrompt.toLowerCase());
}

function isMutatingTask(task: SerializedTask): boolean {
  if (task.type === "edit" || task.type === "write_file") {
    return true;
  }

  const activityFamily = readActivityFamily(task);
  return activityFamily === "edit";
}

function readActivityFamily(task: SerializedTask): string | null {
  const metadata = task.output?.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const activity = (metadata as Record<string, unknown>).activity;
  if (!activity || typeof activity !== "object") {
    return null;
  }

  const family = (activity as Record<string, unknown>).family;
  return typeof family === "string" ? family : null;
}

function formatTaskEvidence(task: SerializedTask): string {
  const activitySummary = summarizeActivity(task.output?.metadata);
  if (activitySummary) {
    return activitySummary;
  }

  return formatDetail(task.output?.content ?? "Completed with no output.");
}

function summarizeActivity(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const activity = (metadata as Record<string, unknown>).activity;
  if (!activity || typeof activity !== "object") {
    return null;
  }

  const family = readString((activity as Record<string, unknown>).family);
  if (family !== "edit") {
    return null;
  }

  const filePath = readString((activity as Record<string, unknown>).filePath);
  const additions = readNumber((activity as Record<string, unknown>).additions);
  const deletions = readNumber((activity as Record<string, unknown>).deletions);
  const parts = [filePath ? `updated ${filePath}` : "updated a file"];

  if (typeof additions === "number" || typeof deletions === "number") {
    parts.push(`(+${additions ?? 0} -${deletions ?? 0})`);
  }

  return parts.join(" ");
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
