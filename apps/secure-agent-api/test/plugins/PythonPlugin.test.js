import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sendCommand, generateSessionId, isApiAvailable } from '../utils.js';

const API_AVAILABLE = await isApiAvailable();

describe('Plugin: Python', { skip: !API_AVAILABLE }, () => {
  const sessionId = generateSessionId();

  it('should execute valid python code', async () => {
    const result = await sendCommand(sessionId, "python", {
      code: "print(5 * 5)"
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output.trim(), "25");
  });

  it('should handle syntax errors', async () => {
    const result = await sendCommand(sessionId, "python", {
      code: "print('missing parenthesis"
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error || result.logs.length > 0);
  });

  it('should install dependencies (requests)', async () => {
    // This tests the pip install logic specifically
    const result = await sendCommand(sessionId, "python", {
      requirements: ["requests"],
      code: "import requests; print('installed')"
    });
    assert.strictEqual(result.success, true);
    assert.match(result.output, /installed/);
  });
});
