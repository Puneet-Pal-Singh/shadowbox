interface CorsEnvConfig {
  CORS_ALLOWED_ORIGINS?: string;
  CORS_ALLOW_DEV_ORIGINS?: "true" | "false";
  FRONTEND_URL?: string;
}

const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-vercel-ai-data-stream, x-ai-sdk-data-stream",
  "Access-Control-Expose-Headers":
    "x-vercel-ai-data-stream, x-ai-sdk-data-stream",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
} as const;

export function getCorsHeaders(
  request: Request,
  env?: CorsEnvConfig,
): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return { ...BASE_CORS_HEADERS };
  }

  const allowedOrigin = resolveAllowedOrigin(origin, env);
  if (!allowedOrigin) {
    return { ...BASE_CORS_HEADERS };
  }

  return {
    ...BASE_CORS_HEADERS,
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
  };
}

export function handleOptions(
  request: Request,
  env?: CorsEnvConfig,
): Response | null {
  if (request.method !== "OPTIONS") {
    return null;
  }

  const origin = request.headers.get("Origin");
  if (origin && !resolveAllowedOrigin(origin, env)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: {
        ...BASE_CORS_HEADERS,
        "Content-Type": "application/json",
      },
    });
  }

  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, env),
  });
}

function resolveAllowedOrigin(
  origin: string,
  env?: CorsEnvConfig,
): string | null {
  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return null;
  }

  const configuredOrigins = parseAllowedOrigins(env);
  if (configuredOrigins.has(normalized)) {
    return normalized;
  }

  if (env?.CORS_ALLOW_DEV_ORIGINS === "true" && isLocalDevOrigin(normalized)) {
    return normalized;
  }

  return null;
}

function parseAllowedOrigins(env?: CorsEnvConfig): Set<string> {
  const originList = new Set<string>();
  const raw = [env?.CORS_ALLOWED_ORIGINS, env?.FRONTEND_URL]
    .filter((value): value is string => typeof value === "string")
    .join(",");

  for (const candidate of raw.split(",")) {
    const normalized = normalizeOrigin(candidate);
    if (normalized) {
      originList.add(normalized);
    }
  }

  return originList;
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    );
  } catch {
    return false;
  }
}
