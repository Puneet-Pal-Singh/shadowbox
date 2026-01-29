export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Permissive for development
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
      headers: CORS_HEADERS,
    });
  }
  return null;
}