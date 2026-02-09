/**
 * Helper to get CORS headers with dynamic origin
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  
  // In production, we should validate the origin against a whitelist
  // For development, we allow the requesting origin if present, otherwise fallback
  const allowOrigin = origin || "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-vercel-ai-data-stream, x-ai-sdk-data-stream",
    "Access-Control-Expose-Headers": "x-vercel-ai-data-stream, x-ai-sdk-data-stream",
    "Access-Control-Allow-Credentials": "true",
    "X-Content-Type-Options": "nosniff",
  };
}

// Keep the static version for simple responses where origin is not available
// but warn that it won't work with credentials if origin is "*"
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-vercel-ai-data-stream, x-ai-sdk-data-stream",
  "Access-Control-Expose-Headers": "x-vercel-ai-data-stream, x-ai-sdk-data-stream",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Handle Preflight OPTIONS requests
 */
export function handleOptions(request: Request): Response | null {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }
  return null;
}