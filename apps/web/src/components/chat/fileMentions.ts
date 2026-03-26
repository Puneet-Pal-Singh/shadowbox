export interface FileMentionMatch {
  start: number;
  end: number;
  query: string;
}

interface RankedCandidate {
  path: string;
  score: number;
}

const MAX_FILE_MENTION_RESULTS = 8;

export function findActiveFileMention(
  input: string,
  caretIndex: number,
): FileMentionMatch | null {
  const safeCaretIndex = Math.max(0, Math.min(caretIndex, input.length));
  const beforeCaret = input.slice(0, safeCaretIndex);
  const triggerIndex = beforeCaret.lastIndexOf("@");

  if (triggerIndex < 0) {
    return null;
  }

  const previousChar = beforeCaret[triggerIndex - 1];
  if (previousChar && !/\s/.test(previousChar)) {
    return null;
  }

  const mentionText = beforeCaret.slice(triggerIndex + 1);
  if (mentionText.startsWith("\"")) {
    const quotedContent = mentionText.slice(1);
    if (hasClosedQuotedMention(quotedContent)) {
      return null;
    }

    return {
      start: triggerIndex,
      end: safeCaretIndex,
      query: unescapeQuotedMention(quotedContent),
    };
  }

  if (/\s/.test(mentionText)) {
    return null;
  }

  return {
    start: triggerIndex,
    end: safeCaretIndex,
    query: mentionText,
  };
}

export function applyFileMention(
  input: string,
  mention: FileMentionMatch,
  filePath: string,
): { nextValue: string; nextCaret: number } {
  const insertedMention = `@${formatMentionPath(filePath)} `;
  const nextValue =
    input.slice(0, mention.start) + insertedMention + input.slice(mention.end);

  return {
    nextValue,
    nextCaret: mention.start + insertedMention.length,
  };
}

export function filterFileMentionCandidates(
  filePaths: string[],
  query: string,
  limit = MAX_FILE_MENTION_RESULTS,
): string[] {
  const normalizedQuery = query.trim().toLowerCase();
  const ranked = filePaths
    .map((path) => rankCandidate(path, normalizedQuery))
    .filter((candidate): candidate is RankedCandidate => candidate !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.path.localeCompare(right.path);
    });

  return ranked.slice(0, limit).map((candidate) => candidate.path);
}

function formatMentionPath(filePath: string): string {
  if (!requiresQuotedMention(filePath)) {
    return filePath;
  }

  return `"${escapeQuotedMention(filePath)}"`;
}

function rankCandidate(path: string, normalizedQuery: string): RankedCandidate | null {
  if (!normalizedQuery) {
    return { path, score: 1 };
  }

  const normalizedPath = path.toLowerCase();
  const fileName = path.split("/").pop()?.toLowerCase() ?? normalizedPath;

  if (fileName === normalizedQuery) {
    return { path, score: 100 };
  }

  if (fileName.startsWith(normalizedQuery)) {
    return { path, score: 90 };
  }

  if (normalizedPath.startsWith(normalizedQuery)) {
    return { path, score: 80 };
  }

  if (normalizedPath.includes(`/${normalizedQuery}`)) {
    return { path, score: 70 };
  }

  if (normalizedPath.includes(normalizedQuery)) {
    return { path, score: 60 };
  }

  return null;
}

function requiresQuotedMention(filePath: string): boolean {
  return /\s/.test(filePath) || /["\\]/.test(filePath);
}

function escapeQuotedMention(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function unescapeQuotedMention(value: string): string {
  return value.replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
}

function hasClosedQuotedMention(value: string): boolean {
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "\"") {
      return true;
    }
  }

  return false;
}
