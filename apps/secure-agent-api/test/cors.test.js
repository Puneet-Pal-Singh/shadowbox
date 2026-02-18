import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isApiAvailable } from './utils.js';

const API_URL = "http://localhost:8787";
const API_AVAILABLE = await isApiAvailable();

describe('CORS Endpoint Reliability', { skip: !API_AVAILABLE }, () => {

  it('should allow localhost origin for history endpoint', async () => {
    const response = await fetch(`${API_URL}/api/chat/history/test-run-id`, {
      method: "GET",
      headers: {
        "Origin": "http://localhost:5173",
        "Content-Type": "application/json"
      }
    });

    // Check CORS headers
    const corsOrigin = response.headers.get('Access-Control-Allow-Origin');
    assert.ok(corsOrigin, "Missing Access-Control-Allow-Origin header");
    assert.strictEqual(corsOrigin, "http://localhost:5173", `Expected localhost origin, got: ${corsOrigin}`);

    // Check that credentials are allowed
    const credentials = response.headers.get('Access-Control-Allow-Credentials');
    assert.strictEqual(credentials, "true", "Should allow credentials for cross-origin requests");
  });

  it('should allow 127.0.0.1 origin for history endpoint', async () => {
    const response = await fetch(`${API_URL}/api/chat/history/test-run-id`, {
      method: "GET",
      headers: {
        "Origin": "http://127.0.0.1:5173",
        "Content-Type": "application/json"
      }
    });

    const corsOrigin = response.headers.get('Access-Control-Allow-Origin');
    assert.strictEqual(corsOrigin, "http://127.0.0.1:5173", `Expected 127.0.0.1 origin, got: ${corsOrigin}`);
  });

  it('should handle OPTIONS preflight request for localhost', async () => {
    const response = await fetch(`${API_URL}/api/chat/history/test-run-id`, {
      method: "OPTIONS",
      headers: {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Content-Type"
      }
    });

    assert.strictEqual(response.status, 204, `Expected 204 No Content, got ${response.status}`);

    const corsOrigin = response.headers.get('Access-Control-Allow-Origin');
    assert.strictEqual(corsOrigin, "http://localhost:5173", "OPTIONS should return CORS headers");

    const methods = response.headers.get('Access-Control-Allow-Methods');
    assert.ok(methods?.includes("GET"), "Should allow GET method");
  });

  it('should reject non-localhost origins in dev mode', async () => {
    const response = await fetch(`${API_URL}/api/chat/history/test-run-id`, {
      method: "GET",
      headers: {
        "Origin": "https://malicious.example.com",
        "Content-Type": "application/json"
      }
    });

    const corsOrigin = response.headers.get('Access-Control-Allow-Origin');
    // Should not include the malicious origin
    assert.notStrictEqual(corsOrigin, "https://malicious.example.com", "Should reject non-localhost origin");
  });

  it('should include Vary: Origin header for proper caching', async () => {
    const response = await fetch(`${API_URL}/api/chat/history/test-run-id`, {
      method: "GET",
      headers: {
        "Origin": "http://localhost:5173"
      }
    });

    const varyHeader = response.headers.get('Vary');
    assert.ok(varyHeader?.includes("Origin"), "Should include Origin in Vary header for cache awareness");
  });
});
