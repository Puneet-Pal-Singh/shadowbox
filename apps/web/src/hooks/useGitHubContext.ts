/**
 * GitHub Context Hook
 *
 * Manages GitHub repository and branch context throughout the application.
 * For session-scoped context, use SessionStateService directly.
 *
 * NOTE: This hook maintains global context for backward compatibility.
 * Session-scoped context is now stored separately via SessionStateService.
 * See App.tsx for per-session GitHub context management.
 *
 * Follows SOLID principles: Single Responsibility, Dependency Inversion.
 * Business logic extracted from components.
 *
 * @module hooks/useGitHubContext
 */

import { useState, useEffect, useCallback } from "react";
import type { Repository } from "../services/GitHubService";
import type { SessionGitHubContext } from "../types/session";
import { SessionStateService } from "../services/SessionStateService";

/**
 * GitHub context data structure
 */
export interface GitHubContextData {
  repo: Repository | null;
  branch: string;
  owner: string;
}

/**
 * Stored context structure for localStorage
 */
interface StoredContext {
  repoOwner: string;
  repoName: string;
  branch: string;
  fullName: string;
}

/**
 * Hook return type
 */
interface UseGitHubContextReturn {
  /** Current repository data */
  repo: Repository | null;
  /** Current branch name */
  branch: string;
  /** Repository owner login */
  owner: string;
  /** Whether context has been loaded from storage */
  isLoaded: boolean;
  /** Set the full context (repo + branch) */
  setContext: (repo: Repository, branch: string) => void;
  /** Switch to a different branch */
  switchBranch: (branch: string) => void;
  /** Clear the context */
  clearContext: () => void;
  /** Refresh context from localStorage */
  refreshContext: () => void;
  /** Save context to session-scoped storage */
  saveSessionContext: (sessionId: string) => void;
}

const STORAGE_KEY = "github_context";

/**
 * Loads context from localStorage
 * @returns Parsed context or null
 */
function loadStoredContext(): StoredContext | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as StoredContext) : null;
  } catch {
    return null;
  }
}

/**
 * Saves context to localStorage
 * @param context - Context to save
 */
function saveStoredContext(context: StoredContext): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
}

/**
 * Converts stored context to Repository type
 * @param stored - Stored context data
 * @returns Repository object
 */
function storedToRepository(stored: StoredContext): Repository {
  return {
    id: 0, // Not stored, but required by type
    name: stored.repoName,
    full_name: stored.fullName,
    owner: {
      login: stored.repoOwner,
      avatar_url: "", // Not stored
    },
    description: null,
    private: false,
    html_url: `https://github.com/${stored.fullName}`,
    clone_url: `https://github.com/${stored.fullName}.git`,
    default_branch: stored.branch,
    stargazers_count: 0,
    language: null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Hook for managing GitHub repository context
 *
 * @example
 * ```tsx
 * const { repo, branch, switchBranch } = useGitHubContext();
 * ```
 */
export function useGitHubContext(): UseGitHubContextReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [repo, setRepo] = useState<Repository | null>(null);
  const [branch, setBranch] = useState<string>("");

  /**
   * Load context from localStorage on mount
   */
  useEffect(() => {
    const stored = loadStoredContext();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRepo(storedToRepository(stored));
      setBranch(stored.branch);
    }
    setIsLoaded(true);
  }, []);

  /**
   * Set full context (repo + branch)
   */
  const setContext = useCallback((newRepo: Repository, newBranch: string) => {
    setRepo(newRepo);
    setBranch(newBranch);

    saveStoredContext({
      repoOwner: newRepo.owner.login,
      repoName: newRepo.name,
      branch: newBranch,
      fullName: newRepo.full_name,
    });
  }, []);

  /**
   * Switch to a different branch
   */
  const switchBranch = useCallback((newBranch: string) => {
    setBranch(newBranch);

    const stored = loadStoredContext();
    if (stored) {
      saveStoredContext({
        ...stored,
        branch: newBranch,
      });
    }
  }, []);

  /**
   * Clear the context
   */
  const clearContext = useCallback(() => {
    setRepo(null);
    setBranch("");
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  /**
   * Refresh context from localStorage
   */
  const refreshContext = useCallback(() => {
    const stored = loadStoredContext();
    if (stored) {
      setRepo(storedToRepository(stored));
      setBranch(stored.branch);
    } else {
      setRepo(null);
      setBranch("");
    }
  }, []);

  /**
   * Helper: Save context to session-scoped storage
   * Used by App.tsx to tie context to a specific session
   */
  const saveSessionContext = useCallback((sessionId: string) => {
    if (!repo) return;

    const context: SessionGitHubContext = {
      repoOwner: repo.owner.login,
      repoName: repo.name,
      fullName: repo.full_name,
      branch,
    };
    SessionStateService.saveSessionGitHubContext(sessionId, context);
  }, [repo, branch]);

  return {
    repo,
    branch,
    owner: repo?.owner.login || "",
    isLoaded,
    setContext,
    switchBranch,
    clearContext,
    refreshContext,
    saveSessionContext,
  };
}
