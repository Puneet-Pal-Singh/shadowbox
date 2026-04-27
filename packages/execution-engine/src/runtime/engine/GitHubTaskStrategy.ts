import type { GitToolFailureKind } from "./GitToolFailureClassifier.js";
import type {
  GitTaskClassification,
  GitTaskLane,
} from "../types.js";

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
    const inPlanMode = input.runMode === "plan";
    const wantsRemoteMetadata = hasRemoteMetadataIntent(userRequest);
    const wantsLocalWork = hasLocalWorkspaceIntent(userRequest);
    const mentionsConnectorGap = /\bconnector gap\b|\bgh cli\b/.test(
      userRequest,
    );

    if (inPlanMode && wantsRemoteMetadata && input.connectorAvailable) {
      return {
        classification: "remote_metadata",
        preferredLane: "github_connector",
        fallbackLane: "github_cli",
        rationale:
          "In plan mode, start with connector metadata and keep the bounded GitHub CLI lane as parity fallback.",
      };
    }

    if (!input.repositoryReady && hasCheckoutIntent(userRequest)) {
      return {
        classification: "local_checkout",
        preferredLane: "shell_git",
        fallbackLane: "typed_git",
        rationale:
          "Repository bootstrap is not fully ready yet; shell-first checkout and diagnostics keep recovery flexible.",
      };
    }

    if (
      input.currentFailure?.kind === "missing_scope_state" &&
      wantsRemoteMetadata
    ) {
      return {
        classification: "remote_metadata",
        preferredLane: input.connectorAvailable
          ? "github_connector"
          : "github_cli",
        rationale:
          "The previous attempt failed due to missing GitHub OAuth scope; keep the current turn read-oriented and surface a reconnect-with-scopes recovery path instead of mutating lanes.",
      };
    }

    if (
      input.currentFailure?.kind === "missing_auth_state" &&
      wantsRemoteMetadata &&
      input.connectorAvailable
    ) {
      return {
        classification: "remote_metadata",
        preferredLane: "github_connector",
        fallbackLane: "github_cli",
        rationale:
          "The previous attempt indicates missing auth state; retry connector metadata first, then bounded GitHub CLI parity if needed.",
      };
    }

    if (
      input.currentFailure?.kind === "unsupported_environment" &&
      wantsRemoteMetadata &&
      input.connectorAvailable
    ) {
      return {
        classification: "remote_metadata",
        preferredLane: "github_connector",
        fallbackLane: "github_cli",
        rationale:
          "Connector metadata remains primary when shell dependencies fail; bounded GitHub CLI stays as parity fallback.",
      };
    }

    if (wantsRemoteMetadata && wantsLocalWork) {
      return this.resolveHybridDecision(input);
    }

    if (wantsRemoteMetadata) {
      return this.resolveRemoteDecision(input, mentionsConnectorGap);
    }

    if (shouldPreferTypedGitAccelerator(userRequest)) {
      return {
        classification: "local_mutation",
        preferredLane: "typed_git",
        fallbackLane: "shell_git",
        rationale:
          "Request matches a high-signal structured git action; typed git is an accelerator with shell fallback.",
      };
    }

    if (hasCheckoutIntent(userRequest)) {
      return {
        classification: "local_checkout",
        preferredLane: "shell_git",
        fallbackLane: "typed_git",
        rationale:
          "Checkout and branch state tasks should stay shell-first for flexible local recovery.",
      };
    }

    return {
      classification: "local_mutation",
      preferredLane: "shell_git",
      fallbackLane: "typed_git",
      rationale:
        "Local repository work defaults to shell-first; typed git stays as an optional accelerator.",
    };
  }

  private resolveHybridDecision(
    input: GitTaskStrategyInput,
  ): GitTaskStrategyDecision {
    if (input.connectorAvailable && input.hasGitHubAuth) {
      return {
        classification: "hybrid_pr_ci",
        preferredLane: "github_connector",
        fallbackLane: "shell_git",
        rationale:
          "Hybrid PR/CI flow should start with connector metadata and continue with shell-first local repair.",
      };
    }

    return {
      classification: "connector_gap",
      preferredLane: "github_connector",
      fallbackLane: "github_cli",
      rationale:
        "Remote metadata is needed but connector access appears limited; use bounded GitHub CLI parity for remote reads while preserving local shell git for workspace steps.",
    };
  }

  private resolveRemoteDecision(
    input: GitTaskStrategyInput,
    mentionsConnectorGap: boolean,
  ): GitTaskStrategyDecision {
    if (
      !mentionsConnectorGap &&
      input.connectorAvailable &&
      input.hasGitHubAuth
    ) {
      return {
        classification: "remote_metadata",
        preferredLane: "github_connector",
        fallbackLane: "github_cli",
        rationale:
          "Remote PR/issue/check metadata is connector-first when authenticated connector access is available, with bounded GitHub CLI parity fallback.",
      };
    }

    return {
      classification: "connector_gap",
      preferredLane: "github_connector",
      fallbackLane: "github_cli",
      rationale:
        "Connector metadata path is unavailable or explicitly bypassed; use bounded GitHub CLI parity instead of raw gh shell commands.",
    };
  }
}

function hasRemoteMetadataIntent(userRequest: string): boolean {
  return /\b(pr|pull request|review|checks?|ci|actions|workflow run|issue)\b/.test(
    userRequest,
  );
}

function hasLocalWorkspaceIntent(userRequest: string): boolean {
  return /\b(checkout|commit|push|pull|rebase|cherry-pick|diff|staged?|branch|fix|patch|tests?)\b/.test(
    userRequest,
  );
}

function hasCheckoutIntent(userRequest: string): boolean {
  return /\b(checkout|switch branch|fetch branch|rebase|cherry-pick)\b/.test(
    userRequest,
  );
}

function shouldPreferTypedGitAccelerator(userRequest: string): boolean {
  return /\b(stage|commit|push|git status|git diff)\b/.test(
    userRequest,
  );
}
