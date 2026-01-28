export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "http://localhost:5173", // Tighten this in production
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-vercel-ai-data-stream",
  "Access-Control-Expose-Headers": "x-vercel-ai-data-stream",
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