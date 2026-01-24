// src/test/utils.js
// Shared test utilities
export const API_URL = "http://localhost:8787";

// Helper to generate unique session IDs so tests don't collide
export const generateSessionId = () => "test-" + Math.random().toString(36).substring(7);

// Generic Command Sender
export async function sendCommand(sessionId, plugin, payload) {
  const response = await fetch(`${API_URL}?session=${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plugin, payload })
  });
  return response.json();
}