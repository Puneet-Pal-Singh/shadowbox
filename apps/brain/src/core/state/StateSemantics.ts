import type { DurableObjectState } from "@cloudflare/workers-types";

type RuntimeStateSemantics = "do" | "kv" | "unknown";

interface SemanticsTaggedState {
  __shadowboxStateSemantics?: RuntimeStateSemantics;
}

export function getRuntimeStateSemantics(
  state: DurableObjectState,
): RuntimeStateSemantics {
  const taggedState = state as DurableObjectState & SemanticsTaggedState;
  return taggedState.__shadowboxStateSemantics ?? "unknown";
}

export function assertRuntimeStateSemantics(
  state: DurableObjectState,
  options: { requireStrictDoSemantics: boolean; runtimePath: string },
): void {
  if (!options.requireStrictDoSemantics) {
    return;
  }

  const semantics = getRuntimeStateSemantics(state);
  if (semantics !== "do") {
    throw new Error(
      `[state/semantics] ${options.runtimePath} requires durable-object semantics but received "${semantics}"`,
    );
  }
}

export function tagRuntimeStateSemantics(
  state: DurableObjectState,
  semantics: "do" | "kv",
): DurableObjectState {
  const taggedState = state as DurableObjectState & SemanticsTaggedState;
  taggedState.__shadowboxStateSemantics = semantics;
  return taggedState;
}
