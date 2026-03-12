import { BudgetExceededError, SessionBudgetExceededError } from "../cost/index.js";
import type { ILLMGateway } from "../llm/index.js";
import type { MemoryContext, MemoryCoordinator } from "../memory/index.js";
import type { Run } from "../run/index.js";
import type { TaskRepository } from "../task/index.js";

interface SynthesizeResultInput {
  run: Run;
  originalPrompt: string;
  memoryContext: MemoryContext | undefined;
  taskRepo: TaskRepository;
  memoryCoordinator: MemoryCoordinator;
  llmGateway: ILLMGateway;
}

export async function synthesizeResultFromTasks({
  run,
  originalPrompt,
  memoryContext,
  taskRepo,
  memoryCoordinator,
  llmGateway,
}: SynthesizeResultInput): Promise<string> {
  const tasks = await taskRepo.getByRun(run.id);
  const taskResults = tasks
    .map(
      (task) =>
        `- [${task.status}] ${task.type}: ${task.input.description}\n  Result: ${task.output?.content || task.error?.message || "N/A"}`,
    )
    .join("\n");

  const memorySection = memoryContext
    ? memoryCoordinator.formatContextForPrompt(memoryContext)
    : "";

  const synthesisPrompt = `Based on the following task outcomes, provide a final summary:

Original Request: ${originalPrompt}

${memorySection ? `Memory Context:\n${memorySection}\n\n` : ""}Completed Tasks:
${taskResults}

Provide a concise summary of what actually happened.
If any task failed or was cancelled, clearly say so and do not claim full completion.`;

  try {
    const result = await llmGateway.generateText({
      context: {
        runId: run.id,
        sessionId: run.sessionId,
        agentType: run.agentType,
        phase: "synthesis",
      },
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant summarizing task execution results accurately.",
        },
        {
          role: "user",
          content: synthesisPrompt,
        },
      ],
      model: run.input.modelId,
      providerId: run.input.providerId,
      temperature: 0.7,
    });

    return result.text;
  } catch (error) {
    if (
      error instanceof BudgetExceededError ||
      error instanceof SessionBudgetExceededError
    ) {
      console.error(`[run/engine] Budget exceeded for run ${run.id}`);
      const completedTasks = tasks.filter((task) => task.status === "DONE").length;
      return `## Summary\n\nBudget limit reached for this run.\n\nCompleted ${completedTasks}/${tasks.length} tasks for your request.\n\n${taskResults}`;
    }

    console.error("[run/engine] Synthesis failed:", error);
    const completedTasks = tasks.filter((task) => task.status === "DONE").length;
    return `## Summary\n\nCompleted ${completedTasks}/${tasks.length} tasks for your request.\n\n${taskResults}`;
  }
}
