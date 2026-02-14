// src/test/utils.js
// Shared test utilities
export const API_URL = "http://localhost:8787";

// Helper to generate unique session IDs so tests don't collide
export const generateSessionId = () => "test-" + Math.random().toString(36).substring(7);

export async function isApiAvailable(timeoutMs = 1000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_URL, {
      method: "GET",
      signal: controller.signal,
    });
    // 404 is acceptable here: we only care that the service is reachable
    return typeof response.status === "number";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// Generic Command Sender
export async function sendCommand(sessionId, plugin, payload) {
  const response = await fetch(`${API_URL}?session=${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plugin, payload })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${body || response.statusText}`);
  }
  return response.json();
}
