export interface ProviderRecoveryAdvice {
  message: string;
  actionLabel: string;
  remediation: string;
}

export function getProviderRecoveryAdvice(
  rawMessage: string | null | undefined,
): ProviderRecoveryAdvice {
  const message = (rawMessage ?? "").trim();

  if (containsActiveRunSelectionConflict(message)) {
    return {
      message:
        "This run is still active, so model/provider selection cannot change yet.",
      actionLabel: "Wait or Stop Current Run",
      remediation:
        "Wait for the current run to finish (or stop it), then retry with your new model selection.",
    };
  }

  if (containsMissingProviderConfiguration(message)) {
    return {
      message:
        "Provider configuration is missing. Connect a provider key or configure a platform default key.",
      actionLabel: "Open Provider Settings",
      remediation:
        "Connect or validate a provider key, then retry your chat request. In private/incognito mode, cookies and storage can reset provider persistence.",
    };
  }

  if (containsPersistenceScopeMismatch(message)) {
    return {
      message:
        "Provider persistence requires an authenticated user/workspace scope.",
      actionLabel: "Re-authenticate",
      remediation:
        "Sign in again, verify workspace access, and avoid private/incognito mode when expecting persistent provider defaults.",
    };
  }

  if (containsProviderSelectionMismatch(message)) {
    return {
      message:
        "Selected provider configuration is invalid for the current session.",
      actionLabel: "Review Session Selection",
      remediation:
        "Choose a connected provider + credential in Provider Settings and retry.",
    };
  }

  if (containsRateLimitError(message)) {
    return {
      message: "Provider rate limit was reached.",
      actionLabel: "Switch Provider",
      remediation:
        "Switch to another connected provider or retry after rate limits reset.",
    };
  }

  return {
    message: message || "Provider setup is required before chat can continue.",
    actionLabel: "Open Provider Settings",
    remediation:
      "Review provider status, reconnect credentials if needed, and retry.",
  };
}

function containsMissingProviderConfiguration(message: string): boolean {
  return (
    message.includes("No default provider key is configured") ||
    message.includes("Missing GROQ_API_KEY") ||
    message.includes("Missing OPENROUTER_API_KEY") ||
    message.includes("Missing AXIS_OPENROUTER_API_KEY") ||
    message.includes("No BYOK provider connected")
  );
}

function containsProviderSelectionMismatch(message: string): boolean {
  return (
    message.includes("INVALID_PROVIDER_SELECTION") ||
    message.includes("providerId does not match credentialId scope") ||
    message.includes("Provider not connected")
  );
}

function containsRateLimitError(message: string): boolean {
  return (
    message.includes("AXIS_DAILY_LIMIT_EXCEEDED") ||
    message.includes("Axis free-tier limit reached") ||
    message.includes("RATE_LIMIT") ||
    message.includes("rate limit") ||
    message.includes("Key limit exceeded")
  );
}

function containsPersistenceScopeMismatch(message: string): boolean {
  return (
    message.includes("Unauthorized: missing or invalid authentication") ||
    message.includes("Missing required X-Run-Id header") ||
    message.includes("MISSING_RUN_ID") ||
    message.includes("AUTH_FAILED")
  );
}

function containsActiveRunSelectionConflict(message: string): boolean {
  return (
    message.includes("RUN_MANIFEST_IMMUTABLE") ||
    message.includes("Run selection is immutable while a run is active")
  );
}
