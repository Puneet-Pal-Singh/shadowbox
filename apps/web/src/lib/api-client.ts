/**
 * API Client - Unified fetch wrapper for all API calls
 * Provides typed, error-normalized access to Brain and Muscle services
 * Ensures consistent error handling, logging, and retry support
 */

import { ApiError, normalizeApiError, logApiError } from "./api-error.js";

/**
 * Fetch options extended with custom metadata
 */
export interface FetchOptions extends RequestInit {
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Whether to log this request (default: true) */
  logRequest?: boolean;
  /** Service name for logging context (e.g., "chat", "git") */
  serviceName?: string;
}

/**
 * Fetch from Brain service with error handling
 * Brain handles: chat, logic, prompt assembly
 */
export async function brainFetch<T>(
  path: string,
  options?: FetchOptions,
): Promise<T> {
  return apiFetch<T>(path, { ...options, serviceName: "brain" });
}

/**
 * Fetch from Muscle service with error handling
 * Muscle handles: execution, git, filesystem, state storage
 */
export async function muscleFetch<T>(
  path: string,
  options?: FetchOptions,
): Promise<T> {
  return apiFetch<T>(path, { ...options, serviceName: "muscle" });
}

/**
 * Internal fetch wrapper with error handling and normalization
 * All API calls flow through this function for consistent behavior
 */
async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const {
    timeout = 30000,
    logRequest = true,
    serviceName = "api",
    ...fetchInit
  } = options;

  const url = path;

  if (logRequest) {
    console.log(`[api/${serviceName}] ${fetchInit.method || "GET"} ${url}`);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check for HTTP errors FIRST, before parsing the body
    if (!response.ok) {
      // Parse error body
      let errorData: unknown;
      try {
        const contentType = response.headers.get("Content-Type");
        const isJson = contentType?.includes("application/json");
        errorData = isJson ? await response.json() : await response.text();
      } catch {
        // If error body parsing fails, use response status as error message
        errorData = undefined;
      }

      const error = new ApiError({
        code: `HTTP_${response.status}`,
        message: `HTTP ${response.status}: ${response.statusText}`,
        retryable: response.status >= 500 || response.status === 408 || response.status === 429,
        requestId: response.headers.get("X-Request-ID") ?? undefined,
        originalError: errorData,
      });

      logApiError(error, serviceName);
      throw error;
    }

    // Parse successful response
    const contentType = response.headers.get("Content-Type");
    const isJson = contentType?.includes("application/json");

    let data: T;
    try {
      data = isJson ? ((await response.json()) as T) : ((await response.text()) as T);
    } catch {
      throw normalizeApiError(new Error("Failed to parse response"));
    }

    if (logRequest) {
      console.log(`[api/${serviceName}] Response OK (${response.status})`);
    }

    return data;
  } catch (error) {
    // Already an ApiError
    if (error instanceof ApiError) {
      throw error;
    }

    // Already normalized ApiErrorShape
    if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
      throw error;
    }

    const normalized = normalizeApiError(error);
    logApiError(normalized, serviceName);
    throw normalized;
  }
}

/**
 * Type-safe wrapper for GET requests to Brain
 */
export function brainGet<T>(path: string, options?: FetchOptions): Promise<T> {
  return brainFetch<T>(path, { ...options, method: "GET" });
}

/**
 * Type-safe wrapper for POST requests to Brain with JSON body
 */
export function brainPost<T>(
  path: string,
  body: unknown,
  options?: FetchOptions,
): Promise<T> {
  return brainFetch<T>(path, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Type-safe wrapper for GET requests to Muscle
 */
export function muscleGet<T>(path: string, options?: FetchOptions): Promise<T> {
  return muscleFetch<T>(path, { ...options, method: "GET" });
}

/**
 * Type-safe wrapper for POST requests to Muscle with JSON body
 */
export function musclePost<T>(
  path: string,
  body: unknown,
  options?: FetchOptions,
): Promise<T> {
  return muscleFetch<T>(path, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Type-safe wrapper for PATCH requests to Muscle with JSON body
 */
export function musclePatch<T>(
  path: string,
  body: unknown,
  options?: FetchOptions,
): Promise<T> {
  return muscleFetch<T>(path, {
    ...options,
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    },
    body: JSON.stringify(body),
  });
}
