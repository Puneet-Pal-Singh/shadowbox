import type { Run } from "../run/index.js";
import type { RunInput } from "../types.js";
import { GitHubTaskStrategy } from "./GitHubTaskStrategy.js";
import {
  GitToolFailureClassifier,
  type GitToolFailureKind,
} from "./GitToolFailureClassifier.js";

export function resolveGitTaskStrategyPolicy(input: {
  run: Run;
  runInput: RunInput;
  hasGitHubAuth: boolean;
  strategy: GitHubTaskStrategy;
  classifier: GitToolFailureClassifier;
}): Run["metadata"]["gitTaskStrategy"] {
  const prompt = input.runInput.prompt?.trim();
  if (!prompt) {
    return undefined;
  }

  const runMode = input.run.metadata.manifest?.mode ?? "build";
  const repositoryReady =
    input.run.metadata.workspaceBootstrap?.ready ??
    !input.runInput.repositoryContext;
  const currentFailure = resolveContinuationGitFailure(
    input.run,
    input.classifier,
  );
  const decision = input.strategy.decide({
    userRequest: prompt,
    runMode,
    repositoryReady,
    hasGitHubAuth: input.hasGitHubAuth,
    connectorAvailable: true,
    currentFailure,
  });

  return {
    ...decision,
    recordedAt: new Date().toISOString(),
  };
}

function resolveContinuationGitFailure(
  run: Run,
  classifier: GitToolFailureClassifier,
): {
  kind: GitToolFailureKind;
  toolName: string;
} | null {
  const continuation = run.metadata.continuation;
  if (!continuation?.failedToolName || !continuation.failedToolDetail) {
    return null;
  }

  if (continuation.failedToolName === "bash") {
    const command = continuation.failedCommand?.toLowerCase() ?? "";
    if (!/\b(git|gh)\b/.test(command)) {
      return null;
    }
  } else if (!continuation.failedToolName.startsWith("git_")) {
    return null;
  }

  const decision = classifier.classify({
    toolName: continuation.failedToolName,
    message: continuation.failedToolDetail,
  });
  return {
    kind: decision.kind,
    toolName: continuation.failedToolName,
  };
}
