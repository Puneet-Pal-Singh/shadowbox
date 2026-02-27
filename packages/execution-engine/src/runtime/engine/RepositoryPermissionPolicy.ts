import type { RepositoryContext } from "../types.js";

const SAFE_REPO_SEGMENT_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const CONTEXTUAL_REPO_REGEX =
  /\b(?:repo|repository|github|from|in|on)\s+([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)/gi;
const GITHUB_URL_REPO_REGEX =
  /github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/gi;
const CROSS_REPO_APPROVAL_REGEX =
  /\b(?:approve|allow)\s+cross[- ]repo\s+([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)(?:\s+for\s+(\d+)\s*([mh]))?\b/i;
const DESTRUCTIVE_APPROVAL_REGEX =
  /\b(?:approve|allow)\s+destructive(?:\s+actions?)?(?:\s+for\s+(\d+)\s*([mh]))?\b/i;
const APPROVAL_ONLY_PREFIX_REGEX = /^(?:please\s+)?(?:approve|allow)\b/i;
const OWNER_DENYLIST = new Set([
  "src",
  "lib",
  "docs",
  "test",
  "tests",
  "scripts",
  "packages",
  "apps",
  "node_modules",
  "dist",
  "build",
]);

const DESTRUCTIVE_PATTERNS = [
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fd\b/i,
  /\bgit\s+push\s+--force(?:-with-lease)?\b/i,
  /\brm\s+-rf\b/i,
  /\bdelete\b.*\b(file|files|directory|repo|repository)\b/i,
  /\bdrop\s+database\b/i,
];

const MIN_APPROVAL_TTL_MS = 5 * 60 * 1000;
const MAX_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CROSS_REPO_TTL_MS = 15 * 60 * 1000;
const DEFAULT_DESTRUCTIVE_TTL_MS = 10 * 60 * 1000;

export interface PermissionApprovalDirective {
  crossRepo?: {
    repoRef: string;
    ttlMs: number;
  };
  destructive?: {
    ttlMs: number;
  };
  isApprovalOnlyPrompt: boolean;
}

export function parsePermissionApprovalDirective(
  prompt: string,
): PermissionApprovalDirective {
  const trimmed = prompt.trim();
  const crossRepoMatch = trimmed.match(CROSS_REPO_APPROVAL_REGEX);
  const destructiveMatch = trimmed.match(DESTRUCTIVE_APPROVAL_REGEX);
  const hasDirective = Boolean(crossRepoMatch || destructiveMatch);

  return {
    crossRepo: parseCrossRepoApproval(crossRepoMatch),
    destructive: parseDestructiveApproval(destructiveMatch),
    isApprovalOnlyPrompt:
      hasDirective && APPROVAL_ONLY_PREFIX_REGEX.test(trimmed),
  };
}

export function detectCrossRepoTarget(
  prompt: string,
  selectedRepoRef: string | null,
): string | null {
  const candidates = [
    ...extractGitHubUrlRepos(prompt),
    ...extractContextualRepos(prompt),
  ];

  for (const candidate of candidates) {
    if (!selectedRepoRef || candidate !== selectedRepoRef) {
      return candidate;
    }
  }

  return null;
}

export function isDestructiveActionPrompt(prompt: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(prompt));
}

export function getSelectedRepoRef(
  repositoryContext?: RepositoryContext,
): string | null {
  return toRepoRef(repositoryContext?.owner, repositoryContext?.repo);
}

export function formatCrossRepoApprovalMessage(
  targetRepo: string,
  selectedRepoRef: string | null,
): string {
  const currentRepo = selectedRepoRef ?? "the current session repository";
  return `This request targets ${targetRepo}, but the selected repo is ${currentRepo}. Reply with \`approve cross-repo ${targetRepo} for 15m\` to continue.`;
}

export function formatDestructiveApprovalMessage(): string {
  return "This request includes destructive operations. Reply with `approve destructive for 10m` to continue.";
}

export function formatCrossRepoApprovalGrantedMessage(
  targetRepo: string,
  ttlMs: number,
): string {
  return `Cross-repo access approved for ${targetRepo} for ${formatDurationMinutes(ttlMs)}.`;
}

export function formatDestructiveApprovalGrantedMessage(ttlMs: number): string {
  return `Destructive-action approval granted for ${formatDurationMinutes(ttlMs)}.`;
}

function parseCrossRepoApproval(
  match: RegExpMatchArray | null,
): PermissionApprovalDirective["crossRepo"] {
  if (!match || !match[1]) {
    return undefined;
  }

  const repoRef = normalizeRepoCandidate(match[1]);
  if (!repoRef) {
    return undefined;
  }

  const ttlMs = parseTtlMs(match[2], match[3], DEFAULT_CROSS_REPO_TTL_MS);
  return { repoRef, ttlMs };
}

function parseDestructiveApproval(
  match: RegExpMatchArray | null,
): PermissionApprovalDirective["destructive"] {
  if (!match) {
    return undefined;
  }

  const ttlMs = parseTtlMs(match[1], match[2], DEFAULT_DESTRUCTIVE_TTL_MS);
  return { ttlMs };
}

function parseTtlMs(
  amountRaw: string | undefined,
  unitRaw: string | undefined,
  defaultMs: number,
): number {
  if (!amountRaw) {
    return defaultMs;
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return defaultMs;
  }

  const unit = unitRaw?.toLowerCase() === "h" ? "h" : "m";
  const millis =
    unit === "h" ? amount * 60 * 60 * 1000 : amount * 60 * 1000;

  return clamp(millis, MIN_APPROVAL_TTL_MS, MAX_APPROVAL_TTL_MS);
}

function extractGitHubUrlRepos(prompt: string): string[] {
  const repos: string[] = [];
  const matches = prompt.matchAll(GITHUB_URL_REPO_REGEX);
  for (const match of matches) {
    const owner = match[1];
    const repo = match[2];
    const repoRef = toRepoRef(owner, repo);
    if (repoRef) {
      repos.push(repoRef);
    }
  }
  return repos;
}

function extractContextualRepos(prompt: string): string[] {
  const repos: string[] = [];
  const matches = prompt.matchAll(CONTEXTUAL_REPO_REGEX);
  for (const match of matches) {
    const repoRef = normalizeRepoCandidate(match[1] ?? "");
    if (repoRef) {
      repos.push(repoRef);
    }
  }
  return repos;
}

function normalizeRepoCandidate(candidate: string): string | null {
  const [ownerRaw, repoRaw] = candidate.trim().split("/", 2);
  return toRepoRef(ownerRaw, repoRaw);
}

function toRepoRef(
  ownerRaw: string | undefined,
  repoRaw: string | undefined,
): string | null {
  const owner = ownerRaw?.trim().toLowerCase() ?? "";
  const repo = repoRaw?.trim().toLowerCase() ?? "";

  if (
    !SAFE_REPO_SEGMENT_REGEX.test(owner) ||
    !SAFE_REPO_SEGMENT_REGEX.test(repo)
  ) {
    return null;
  }

  if (OWNER_DENYLIST.has(owner)) {
    return null;
  }

  return `${owner}/${repo}`;
}

function formatDurationMinutes(ttlMs: number): string {
  const minutes = Math.max(1, Math.round(ttlMs / (60 * 1000)));
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
