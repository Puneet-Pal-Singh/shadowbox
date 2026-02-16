/**
 * Platform Endpoints - Centralized endpoint resolution for all API services
 * Removes hardcoded URLs and enforces environment-driven configuration
 * Provides type-safe path builders for all API routes
 */

/**
 * Get the Brain service base HTTP URL
 * Brain handles logic, prompt assembly, and tool selection
 * Default: http://localhost:8788 (dev only)
 */
export function getBrainHttpBase(): string {
  const url = import.meta.env.VITE_BRAIN_BASE_URL;
  if (url) {
    return url;
  }

  // Safe local default for development
  const defaultUrl = "http://localhost:8788";
  console.warn(
    "[platform-endpoints] VITE_BRAIN_BASE_URL not set, using default:",
    defaultUrl,
  );
  return defaultUrl;
}

/**
 * Get the Muscle service base HTTP URL
 * Muscle handles code execution, git operations, and filesystem
 * Default: http://localhost:8787 (dev only)
 */
export function getMuscleHttpBase(): string {
  const url = import.meta.env.VITE_MUSCLE_BASE_URL;
  if (url) {
    return url;
  }

  // Safe local default for development
  const defaultUrl = "http://localhost:8787";
  console.warn(
    "[platform-endpoints] VITE_MUSCLE_BASE_URL not set, using default:",
    defaultUrl,
  );
  return defaultUrl;
}

/**
 * Get the Muscle service base WebSocket URL
 * Used for real-time terminal sessions and streaming
 * Default: ws://localhost:8787 (dev only)
 */
export function getMuscleWsBase(): string {
  const url = import.meta.env.VITE_MUSCLE_WS_URL;
  if (url) {
    return url;
  }

  // Safe local default for development
  const defaultUrl = "ws://localhost:8787";
  console.warn(
    "[platform-endpoints] VITE_MUSCLE_WS_URL not set, using default:",
    defaultUrl,
  );
  return defaultUrl;
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
  const requiredEnvVars = [
    "VITE_BRAIN_BASE_URL",
    "VITE_MUSCLE_BASE_URL",
    "VITE_MUSCLE_WS_URL",
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !import.meta.env[varName],
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
