import { PlannerError } from "../planner/index.js";
import { LLMTimeoutError } from "../llm/index.js";

const STRUCTURED_SCHEMA_MISMATCH_SENTINEL =
  "No object generated: response did not match schema";

export function buildPlanningRecoveryMessage(error: unknown): string | null {
  if (isPlanningSchemaMismatchError(error)) {
    return [
      "I couldn't generate a valid structured plan for this turn, so I stopped before running tools.",
      "Try a more concrete request like `read README.md`, `list files in src`, or `run pnpm test`.",
      "If your request is conversational, retry in plain chat without asking for repository actions.",
    ].join(" ");
  }

  if (isPlanningTimeoutError(error)) {
    return [
      "Planning timed out before I could build safe executable tasks.",
      "Please retry with a narrower request (specific file path or command).",
    ].join(" ");
  }

  return null;
}

function isPlanningSchemaMismatchError(error: unknown): boolean {
  if (error instanceof PlannerError && error.code === "PLAN_SCHEMA_MISMATCH") {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes(STRUCTURED_SCHEMA_MISMATCH_SENTINEL);
}

function isPlanningTimeoutError(error: unknown): boolean {
  if (error instanceof LLMTimeoutError) {
    return error.phase === "planning";
  }
  if (error instanceof PlannerError && error.code === "PLAN_GENERATION_TIMEOUT") {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "LLMTimeoutError" &&
    error.message.includes("(phase=planning)")
  );
}
