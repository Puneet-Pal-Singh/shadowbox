/**
 * Platform Endpoints - Centralized endpoint resolution for all API services
 * Removes hardcoded URLs and enforces environment-driven configuration
 * Provides type-safe path builders for all API routes
 */

// Module-level cache for base URLs to avoid repeated warnings
let brainHttpBaseCache: string | undefined;
let muscleHttpBaseCache: string | undefined;
let muscleWsBaseCache: string | undefined;

/**
 * Reset endpoint cache (for testing only)
 * @internal
 */
export function _resetEndpointCache(): void {
  brainHttpBaseCache = undefined;
  muscleHttpBaseCache = undefined;
  muscleWsBaseCache = undefined;
}

/**
 * Strip trailing slashes from URL
 */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Get the Brain service base HTTP URL
 * Brain handles logic, prompt assembly, and tool selection
 * Default: http://localhost:8788 (dev only)
 */
export function getBrainHttpBase(): string {
  // Return cached value if available
  if (brainHttpBaseCache !== undefined) {
    return brainHttpBaseCache;
  }

  const url = import.meta.env.VITE_BRAIN_BASE_URL;
  if (url) {
    brainHttpBaseCache = stripTrailingSlash(url);
    return brainHttpBaseCache;
  }

  // Safe local default for development
  const defaultUrl = "http://localhost:8788";
  console.warn(
    "[platform-endpoints] VITE_BRAIN_BASE_URL not set, using default:",
    defaultUrl,
  );
  brainHttpBaseCache = defaultUrl;
  return brainHttpBaseCache;
}

/**
 * Get the Muscle service base HTTP URL
 * Muscle handles code execution, git operations, and filesystem
 * Default: http://localhost:8787 (dev only)
 */
export function getMuscleHttpBase(): string {
  // Return cached value if available
  if (muscleHttpBaseCache !== undefined) {
    return muscleHttpBaseCache;
  }

  const url = import.meta.env.VITE_MUSCLE_BASE_URL;
  if (url) {
    muscleHttpBaseCache = stripTrailingSlash(url);
    return muscleHttpBaseCache;
  }

  // Safe local default for development
  const defaultUrl = "http://localhost:8787";
  console.warn(
    "[platform-endpoints] VITE_MUSCLE_BASE_URL not set, using default:",
    defaultUrl,
  );
  muscleHttpBaseCache = defaultUrl;
  return muscleHttpBaseCache;
}

/**
 * Get the Muscle service base WebSocket URL
 * Used for real-time terminal sessions and streaming
 * Default: ws://localhost:8787 (dev only)
 */
export function getMuscleWsBase(): string {
  // Return cached value if available
  if (muscleWsBaseCache !== undefined) {
    return muscleWsBaseCache;
  }

  const url = import.meta.env.VITE_MUSCLE_WS_URL;
  if (url) {
    muscleWsBaseCache = stripTrailingSlash(url);
    return muscleWsBaseCache;
  }

  // Safe local default for development
  const defaultUrl = "ws://localhost:8787";
  console.warn(
    "[platform-endpoints] VITE_MUSCLE_WS_URL not set, using default:",
    defaultUrl,
  );
  muscleWsBaseCache = defaultUrl;
  return muscleWsBaseCache;
}

/**
 * Build the full chat stream endpoint URL
 * Used for streaming chat responses from Brain
 * Path: /chat
 */
export function chatStreamPath(): string {
  return `${getBrainHttpBase()}/chat`;
}

/**
 * Build the full chat history endpoint URL
 * Used for fetching previous chat messages from Muscle
 * Path: /api/chat/history
 */
export function chatHistoryPath(runId: string): string {
  return `${getMuscleHttpBase()}/api/chat/history/${encodeURIComponent(runId)}`;
}

/**
 * Build the full git status endpoint URL
 * Used for fetching current git status from Muscle
 * Path: /api/git/status
 */
export function gitStatusPath(runId: string): string {
  return `${getMuscleHttpBase()}/api/git/status/${encodeURIComponent(runId)}`;
}

/**
 * Build the full git stage/unstage endpoint URL
 * Used for staging/unstaging files via Muscle
 * Path: /api/git/stage
 * Contract: { files: string[], unstage?: boolean }
 */
export function gitStagePath(runId: string): string {
  return `${getMuscleHttpBase()}/api/git/stage/${encodeURIComponent(runId)}`;
}

/**
 * Build the artifact endpoint URL
 * Used for loading artifact content from Muscle
 * Path: /api/artifacts/:key
 */
export function artifactPath(runId: string, key: string): string {
  return `${getMuscleHttpBase()}/api/artifacts/${encodeURIComponent(runId)}/${encodeURIComponent(key)}`;
}

/**
 * Build the terminal WebSocket connection path
 * Used for establishing real-time terminal sessions
 * Path: /connect?session=<sessionId>
 */
export function terminalConnectPath(sessionId: string): string {
  const wsBase = getMuscleWsBase();
  return `${wsBase}/connect?session=${encodeURIComponent(sessionId)}`;
}

/**
 * Build the terminal command execution endpoint URL
 * Used for executing commands in terminal via HTTP
 * Path: /?session=<sessionId>
 */
export function terminalCommandPath(sessionId: string): string {
  return `${getMuscleHttpBase()}/?session=${encodeURIComponent(sessionId)}`;
}

/**
 * Validate all required environment variables at startup
 * Logs warnings for missing env vars (safe to run with defaults in dev)
 */
export function validateEndpointConfig(): void {
  const requiredEnvVars: Array<keyof ImportMetaEnv> = [
    "VITE_BRAIN_BASE_URL",
    "VITE_MUSCLE_BASE_URL",
    "VITE_MUSCLE_WS_URL",
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !(import.meta.env as unknown as Record<string, unknown>)[varName],
  );

  if (missingVars.length > 0 && import.meta.env.MODE === "production") {
    console.error(
      "[platform-endpoints] Missing required environment variables in production:",
      missingVars,
    );
  }

  if (missingVars.length > 0 && import.meta.env.MODE !== "production") {
    console.warn(
      "[platform-endpoints] Using default endpoints for missing env vars:",
      missingVars,
    );
  }
}
