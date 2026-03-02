export type RetryReasonCode =
  | "DETERMINISTIC_COMMAND_POLICY"
  | "DETERMINISTIC_PATH_VALIDATION"
  | "DETERMINISTIC_INPUT_VALIDATION"
  | "DETERMINISTIC_INVALID_TARGET"
  | "TRANSIENT_OR_UNKNOWN";

export interface RetryClassification {
  retryable: boolean;
  reasonCode: RetryReasonCode;
}

const DETERMINISTIC_RULES: Array<{
  pattern: RegExp;
  reasonCode: Exclude<RetryReasonCode, "TRANSIENT_OR_UNKNOWN">;
}> = [
  {
    pattern: /command not allowed|git shell commands are not allowed|unsafe shell token/i,
    reasonCode: "DETERMINISTIC_COMMAND_POLICY",
  },
  {
    pattern: /path traversal detected|absolute paths are not allowed|path cannot be empty/i,
    reasonCode: "DETERMINISTIC_PATH_VALIDATION",
  },
  {
    pattern: /missing '.*' field|must be a concrete non-empty|invalid git action|invalid payload|schema/i,
    reasonCode: "DETERMINISTIC_INPUT_VALIDATION",
  },
  {
    pattern: /is a directory|no such file or directory|file does not exist|not found/i,
    reasonCode: "DETERMINISTIC_INVALID_TARGET",
  },
];

export function classifyRetryability(message: string): RetryClassification {
  for (const rule of DETERMINISTIC_RULES) {
    if (rule.pattern.test(message)) {
      return {
        retryable: false,
        reasonCode: rule.reasonCode,
      };
    }
  }

  return {
    retryable: true,
    reasonCode: "TRANSIENT_OR_UNKNOWN",
  };
}
