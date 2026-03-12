import type { CoreMessage } from "ai";
import { z } from "zod";
import type { RepositoryContext } from "../types.js";
import type { Run } from "../run/index.js";
import type { ILLMGateway } from "../llm/index.js";

const TURN_MODE_SCHEMA = z.object({
  mode: z.enum(["chat", "action"]),
  rationale: z.string().max(400).optional(),
});

export type TurnMode = z.infer<typeof TURN_MODE_SCHEMA>["mode"];

interface DetermineTurnModeInput {
  llmGateway: ILLMGateway;
  run: Run;
  prompt: string;
  messages: CoreMessage[];
  repositoryContext?: RepositoryContext;
}

export async function determineTurnMode({
  llmGateway,
  run,
  prompt,
  messages,
  repositoryContext,
}: DetermineTurnModeInput): Promise<TurnMode> {
  const classifierMessages = buildTurnModeMessages(
    prompt,
    messages,
    repositoryContext,
  );

  const result = await llmGateway.generateStructured({
    context: {
      runId: run.id,
      sessionId: run.sessionId,
      agentType: run.agentType,
      phase: "planning",
    },
    schema: TURN_MODE_SCHEMA,
    messages: classifierMessages,
    model: run.input.modelId,
    providerId: run.input.providerId,
    temperature: 0,
  });

  return result.object.mode === "chat" ? "chat" : "action";
}

function buildTurnModeMessages(
  prompt: string,
  messages: CoreMessage[],
  repositoryContext?: RepositoryContext,
): Array<{ role: "system" | "user"; content: string }> {
  const recentTurns = messages
    .slice(-8)
    .map((message) => formatTurnModeMessage(message))
    .filter((line) => line.length > 0);

  const repositoryLine = repositoryContext?.owner && repositoryContext?.repo
    ? `Repository selection: ${repositoryContext.owner}/${repositoryContext.repo}${repositoryContext.branch ? `@${repositoryContext.branch}` : ""}.`
    : "Repository selection: none.";

  return [
    {
      role: "system",
      content: [
        "Classify the user's latest request into a turn mode.",
        'Return "chat" when the request is conversational (greeting, Q&A, general explanation, capability question) and does not require repository/tool execution.',
        'Return "action" when the request requires reading/modifying repository files, running commands, or any tool execution.',
        "Use the recent conversation and repository selection for context when the latest request is brief (for example: continue, do it, same repo).",
        "Respond strictly with schema-compliant JSON.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        repositoryLine,
        "Recent conversation:",
        recentTurns.join("\n") || "(none)",
        "Latest user request:",
        prompt,
      ].join("\n"),
    },
  ];
}

function formatTurnModeMessage(message: CoreMessage): string {
  const role = message.role.toUpperCase();
  const content = extractTurnModeMessageContent(message.content);
  if (!content) {
    return "";
  }
  return `${role}: ${content}`;
}

function extractTurnModeMessageContent(content: CoreMessage["content"]): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (!part || typeof part !== "object") {
        return "";
      }

      const candidate = part as unknown as Record<string, unknown>;
      if (typeof candidate.text === "string") {
        return candidate.text;
      }
      if (typeof candidate.content === "string") {
        return candidate.content;
      }
      return "";
    })
    .filter((text) => text.trim().length > 0)
    .join("\n")
    .trim();
}
