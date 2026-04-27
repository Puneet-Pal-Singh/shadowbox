import type { Plan } from "../planner/index.js";
import type { Run } from "../run/index.js";
import type { RunPlanArtifact, RunPlanArtifactTask } from "../types.js";

export function persistPlanArtifact(run: Run, plan: Plan): RunPlanArtifact {
  const artifact = buildPlanArtifact(run, plan);
  run.metadata.planId = artifact.id;
  run.metadata.planArtifact = artifact;
  return artifact;
}

export function buildPlanModeResponse(artifact: RunPlanArtifact): string {
  const taskLines = artifact.tasks.map(
    (task, index) =>
      `${index + 1}. [${task.executionKind}] ${task.description}${task.expectedOutput ? ` (${task.expectedOutput})` : ""}`,
  );

  return [
    "Plan mode prepared a safe execution outline. No files, commands, or mutating tools were run.",
    "",
    `Plan summary: ${artifact.summary}`,
    `Estimated steps: ${artifact.estimatedSteps}`,
    "",
    "Planned steps:",
    ...taskLines,
  ].join("\n");
}

function buildPlanArtifact(run: Run, plan: Plan): RunPlanArtifact {
  const createdAt = new Date().toISOString();
  const tasks: RunPlanArtifactTask[] = plan.tasks.map((task) => ({
    id: task.id,
    type: task.type,
    description: task.description,
    dependsOn: task.dependsOn,
    expectedOutput: task.expectedOutput,
    executionKind: isMutatingTaskType(task.type) ? "mutating" : "read",
  }));
  const summary =
    plan.metadata.reasoning ??
    `Outlined ${tasks.length} execution step${tasks.length === 1 ? "" : "s"} for the request.`;

  return {
    id: `${run.id}:plan`,
    createdAt,
    summary,
    estimatedSteps: plan.metadata.estimatedSteps,
    reasoning: plan.metadata.reasoning,
    tasks,
    handoff: {
      targetMode: "build",
      summary:
        "Switch to Build mode and send the handoff prompt below when you want LegionCode to execute this plan.",
      prompt: buildPlanHandoffPrompt(run.input.prompt, tasks),
    },
  };
}

function buildPlanHandoffPrompt(
  originalPrompt: string,
  tasks: RunPlanArtifact["tasks"],
): string {
  const taskSummary = tasks
    .map(
      (task, index) =>
        `${index + 1}. ${task.description}${task.expectedOutput ? ` -> ${task.expectedOutput}` : ""}`,
    )
    .join("\n");

  return [
    "Execute this approved plan in build mode:",
    taskSummary,
    "",
    `Original request: ${originalPrompt}`,
  ].join("\n");
}

function isMutatingTaskType(taskType: string): boolean {
  return taskType !== "analyze" && taskType !== "review";
}
