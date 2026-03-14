import type { SerializedTask } from "../types.js";

interface TaskSections {
  completed: SerializedTask[];
  failed: SerializedTask[];
  pending: SerializedTask[];
}

export interface GroundedTaskSummary {
  evidencePrompt: string;
  fallbackSummary: string;
  sections: TaskSections;
}

export function buildGroundedTaskSummary(
  originalPrompt: string,
  tasks: SerializedTask[],
): GroundedTaskSummary {
  const sections = partitionTasks(tasks);
  const evidencePrompt = [
    `Original Request: ${originalPrompt}`,
    "",
    "Execution Evidence:",
    formatSection("Completed", sections.completed, formatCompletedTask),
    formatSection("Failed", sections.failed, formatFailedTask),
    formatSection("Pending", sections.pending, formatPendingTask),
    "",
    "Rules:",
    "- summarize only from the evidence above",
    "- do not claim work is complete if Failed or Pending sections are non-empty",
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

  return {
    evidencePrompt,
    fallbackSummary,
    sections,
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
  return `- ${task.input.description}: ${formatDetail(
    task.output?.content ?? "Completed with no output.",
  )}`;
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
