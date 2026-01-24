import { describe, it } from 'node:test';
import assert from 'node:assert';

const API_URL = "http://localhost:8787";
// Use a random session ID so tests don't conflict with each other
const SESSION_ID = "test-session-" + Math.floor(Math.random() * 10000);

async function sendCommand(plugin, payload) {
  const response = await fetch(`${API_URL}?session=${SESSION_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plugin, payload })
  });
  return response.json();
}

describe('AgentRuntime Integration', () => {

  it('should run basic Python math', async () => {
    const result = await sendCommand("python", {
      code: "print(10 + 10)"
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output.trim(), "20");
  });

  it('should handle Python errors gracefully', async () => {
    const result = await sendCommand("python", {
      code: "print(unknown_variable)"
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.logs.length > 0, "Should have error logs");
  });

  it('should persist files between requests (State)', async () => {
    await sendCommand("python", {
      code: "with open('secret.txt', 'w') as f: f.write('My Secret Data')"
    });
    const result = await sendCommand("python", {
      code: "with open('secret.txt', 'r') as f: print(f.read())"
    });
    assert.strictEqual(result.output.trim(), "My Secret Data");
  });

  // UPDATED TEST: Easier debugging
  it('should install dependencies dynamically', async () => {
    // 1. We verify 'requests' works. 
    // Note: We pre-installed 'requests' in the Dockerfile, so this should be fast.
    const result = await sendCommand("python", {
      requirements: ["requests"], // This triggers the pip install check
      code: "import requests; print('Library Works')"
    });

    // DEBUGGING BLOCK: If it fails, show me why!
    if (!result.success) {
      console.error("\n⚠️ DEPENDENCY TEST FAILED LOGS:");
      console.error(result.logs ? result.logs.join("\n") : result.error);
      console.error("--------------------------------");
    }

    assert.strictEqual(result.success, true, "Dependency installation failed");
    assert.match(result.output, /Library Works/);
  });

});