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
  let index = 0;

  while (index < input.length) {
    if (!isMentionTrigger(input, index)) {
      index += 1;
      continue;
    }

    const token = parseMentionToken(input, index);
    if (!token) {
      index += 1;
      continue;
    }

    if (
      safeCaretIndex > token.start &&
      safeCaretIndex <= token.activeEnd
    ) {
      return {
        start: token.start,
        end: token.end,
        query: token.quoted
          ? unescapeQuotedMention(input.slice(token.queryStart, safeCaretIndex))
          : input.slice(token.queryStart, safeCaretIndex),
      };
    }

    index = Math.max(token.end, index + 1);
  }

  return null;
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

interface ParsedMentionToken {
  start: number;
  end: number;
  queryStart: number;
  activeEnd: number;
  quoted: boolean;
}

function isMentionTrigger(input: string, index: number): boolean {
  if (input[index] !== "@") {
    return false;
  }

  const previousChar = input[index - 1];
  return !previousChar || /\s/.test(previousChar);
}

function parseMentionToken(
  input: string,
  start: number,
): ParsedMentionToken | null {
  const nextCharacter = input[start + 1];
  if (nextCharacter === "\"") {
    return parseQuotedMentionToken(input, start);
  }

  return parseUnquotedMentionToken(input, start);
}

function parseQuotedMentionToken(
  input: string,
  start: number,
): ParsedMentionToken {
  const queryStart = start + 2;
  let index = queryStart;
  let escaped = false;

  while (index < input.length) {
    const character = input[index];

    if (escaped) {
      escaped = false;
      index += 1;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      index += 1;
      continue;
    }

    if (character === "\"") {
      return {
        start,
        end: index + 1,
        queryStart,
        activeEnd: index,
        quoted: true,
      };
    }

    index += 1;
  }

  return {
    start,
    end: input.length,
    queryStart,
    activeEnd: input.length,
    quoted: true,
  };
}

function parseUnquotedMentionToken(
  input: string,
  start: number,
): ParsedMentionToken {
  let index = start + 1;

  while (index < input.length && !/\s/.test(input[index] ?? "")) {
    index += 1;
  }

  return {
    start,
    end: index,
    queryStart: start + 1,
    activeEnd: index,
    quoted: false,
  };
}

function escapeQuotedMention(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function unescapeQuotedMention(value: string): string {
  return value.replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
}
