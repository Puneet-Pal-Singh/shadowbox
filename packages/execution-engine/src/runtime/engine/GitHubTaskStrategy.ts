import type { GitToolFailureKind } from "./GitToolFailureClassifier.js";
import type { GitTaskClassification, GitTaskLane } from "../types.js";

export interface GitTaskStrategyInput {
  userRequest: string;
  runMode: "build" | "plan";
  repositoryReady: boolean;
  hasGitHubAuth: boolean;
  connectorAvailable: boolean;
  currentFailure?:
    | {
        kind: GitToolFailureKind;
        toolName: string;
      }
    | null;
}

export interface GitTaskStrategyDecision {
  classification: GitTaskClassification;
  preferredLane: GitTaskLane;
  fallbackLane?: GitTaskLane;
  rationale: string;
}

export class GitHubTaskStrategy {
  decide(input: GitTaskStrategyInput): GitTaskStrategyDecision {
    const userRequest = input.userRequest.toLowerCase();
    const inspectClassification = resolveInspectClassification(userRequest);
    const wantsPublishMutation = hasPublishMutationIntent(userRequest);
    const wantsFixMutation = hasFixMutationIntent(userRequest);

    if (inspectClassification && hasInspectRecoveryFailure(input.currentFailure)) {
      return this.buildInspectDecision(
        input,
        inspectClassification,
        "The previous attempt failed on remote metadata access. Keep this turn in inspect-only mode and avoid mutation lanes until the user explicitly asks to fix or publish.",
      );
    }

    if (
      input.runMode === "plan" &&
      inspectClassification &&
      !wantsPublishMutation &&
      !wantsFixMutation
    ) {
      return this.buildInspectDecision(
        input,
        inspectClassification,
        "Plan-mode inspection should stay read-only and connector-first for CI/PR evidence gathering.",
      );
    }

    if (wantsPublishMutation) {
      return {
        classification: "mutate_publish",
        preferredLane: "shell_git",
        fallbackLane: "typed_git",
        rationale:
          "The request explicitly asks for publish-oriented git mutations (stage/commit/push/branch/PR), so route through mutation lanes.",
      };
    }

    if (wantsFixMutation) {
      return {
        classification: "mutate_fix",
        preferredLane: "shell_git",
        fallbackLane: "typed_git",
        rationale:
          "The request asks for code changes or fixes, so keep a mutation-capable local lane.",
      };
    }

    if (inspectClassification) {
      return this.buildInspectDecision(
        input,
        inspectClassification,
        "This request is inspection-only for CI/PR/review state, so keep it read-only.",
      );
    }

    if (!input.repositoryReady && hasCheckoutIntent(userRequest)) {
      return {
        classification: "mutate_publish",
        preferredLane: "shell_git",
        fallbackLane: "typed_git",
        rationale:
          "Repository bootstrap is incomplete and checkout work is needed, so use shell-first git mutation recovery.",
      };
    }

    return {
      classification: "mutate_fix",
      preferredLane: "shell_git",
      fallbackLane: "typed_git",
      rationale:
        "Defaulting to local mutation-capable workflow when the request is not clearly inspect-only.",
    };
  }

  private buildInspectDecision(
    input: GitTaskStrategyInput,
    classification: Extract<
      GitTaskClassification,
      "inspect_ci" | "inspect_pr" | "inspect_review"
    >,
    rationale: string,
  ): GitTaskStrategyDecision {
    if (input.connectorAvailable && input.hasGitHubAuth) {
      return {
        classification,
        preferredLane: "github_connector",
        fallbackLane: "github_cli",
        rationale,
      };
    }

    return {
      classification,
      preferredLane: "github_connector",
      fallbackLane: "github_cli",
      rationale:
        "Remote inspection is required but connector access may be constrained; use connector-first with bounded GitHub CLI parity fallback.",
    };
  }
}

function resolveInspectClassification(
  userRequest: string,
): Extract<GitTaskClassification, "inspect_ci" | "inspect_pr" | "inspect_review"> | null {
  if (hasReviewInspectionIntent(userRequest)) {
    return "inspect_review";
  }

  if (hasCiInspectionIntent(userRequest)) {
    return "inspect_ci";
  }

  if (hasPrInspectionIntent(userRequest)) {
    return "inspect_pr";
  }

  return null;
}

function hasCiInspectionIntent(userRequest: string): boolean {
  return /\b(ci|checks?|workflow|actions|job|run|logs?)\b/.test(userRequest);
}

function hasReviewInspectionIntent(userRequest: string): boolean {
  return /\b(review comments?|review threads?|requested changes?|code review)\b/.test(
    userRequest,
  );
}

function hasPrInspectionIntent(userRequest: string): boolean {
  return /\b(pr|pull request|pull-requests?)\b/.test(userRequest);
}

function hasFixMutationIntent(userRequest: string): boolean {
  return /\b(fix|patch|edit|update|rewrite|refactor|implement|change)\b/.test(
    userRequest,
  );
}

function hasPublishMutationIntent(userRequest: string): boolean {
  return /\b(stage|commit|push|publish|open pr|create pr|branch|checkout|merge|rebase|cherry-pick)\b/.test(
    userRequest,
  );
}

function hasCheckoutIntent(userRequest: string): boolean {
  return /\b(checkout|switch branch|fetch branch|rebase|cherry-pick)\b/.test(
    userRequest,
  );
}

function hasInspectRecoveryFailure(
  currentFailure:
    | {
        kind: GitToolFailureKind;
        toolName: string;
      }
    | null
    | undefined,
): boolean {
  if (!currentFailure) {
    return false;
  }

  return (
    currentFailure.kind === "missing_scope_state" ||
    currentFailure.kind === "missing_auth_state" ||
    currentFailure.kind === "unsupported_environment"
  );
}
