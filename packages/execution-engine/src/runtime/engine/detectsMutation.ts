const MUTATION_KEYWORDS = [
  "add",
  "append",
  "build",
  "change",
  "construct",
  "create",
  "delete",
  "develop",
  "edit",
  "fix",
  "generate",
  "implement",
  "improve",
  "insert",
  "modify",
  "refactor",
  "remove",
  "rename",
  "replace",
  "rewrite",
  "update",
  "write",
] as const;

const MUTATION_KEYWORD_PATTERN = new RegExp(
  `\\b(?:${MUTATION_KEYWORDS.join("|")})\\b`,
  "i",
);

const COMPOUND_MUTATION_PATTERN =
  /\bmake\b[\s\S]{0,80}\b(prettier|better|cleaner|modern)\b/i;

export function detectsMutation(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  return (
    MUTATION_KEYWORD_PATTERN.test(normalized) ||
    COMPOUND_MUTATION_PATTERN.test(normalized)
  );
}
