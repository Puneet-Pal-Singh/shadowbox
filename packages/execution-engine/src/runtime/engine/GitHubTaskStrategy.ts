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
        fallbackLane: "shell_git",
        rationale:
          "In plan mode, start with connector metadata to anchor the execution plan before local mutation steps.",
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
      input.currentFailure?.kind === "missing_auth_state" &&
      wantsRemoteMetadata &&
      input.connectorAvailable
    ) {
      return {
        classification: "remote_metadata",
        preferredLane: "github_connector",
        fallbackLane: "shell_git",
        rationale:
          "The previous attempt indicates missing git auth state; retry remote metadata through the connector lane first.",
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
        fallbackLane: "shell_git",
        rationale:
          "Shell dependencies were unavailable in the previous step, so connector metadata should be the primary lane.",
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
      fallbackLane: "shell_git",
      rationale:
        "Remote metadata is needed but connector access appears limited; retry connector reads and continue with local shell git only for workspace steps.",
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
        fallbackLane: "shell_git",
        rationale:
          "Remote PR/issue/check metadata is connector-first when authenticated connector access is available.",
      };
    }

    return {
      classification: "connector_gap",
      preferredLane: "github_connector",
      fallbackLane: "shell_git",
      rationale:
        "Connector metadata path is unavailable or explicitly bypassed; avoid gh shell commands and continue only with local shell git steps.",
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
