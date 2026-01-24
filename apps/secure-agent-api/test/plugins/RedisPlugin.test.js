import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sendCommand, generateSessionId } from '../utils.js';

describe('Plugin: Redis (Go Sidecar)', () => {
  const sessionId = generateSessionId();

  it('should verify the sidecar is running', async () => {
    const result = await sendCommand(sessionId, "redis", {});
    
    if (!result.success) {
        console.error("\n❌ TEST FAILED. Sidecar Logs:");
        if (result.logs && result.logs.length > 0) {
            console.error(result.logs.join("\n"));
        } else {
            console.error(result.error || "No logs available");
        }
        console.error("------------------------------\n");
    }

    assert.strictEqual(result.success, true, "Redis plugin reported failure");
  });

  it('should allow Python to connect', async () => {
    const result = await sendCommand(sessionId, "python", {
      requirements: ["redis"],
      code: `
import redis
import sys

# Try connecting to 6378 (Default) then 6379
def connect():
    for port in [6378, 6379]:
        try:
            r = redis.Redis(host='localhost', port=port, db=0, socket_timeout=1)
            r.ping()
            return r, port
        except:
            continue
    return None, 0

r, port = connect()
if not r:
    print("ERROR: Could not connect to 6378 or 6379")
    sys.exit(1)

print(f"STATUS: Connected on {port}")
r.set('hybrid_key', 'Success')
print(f"VALUE: {r.get('hybrid_key').decode('utf-8')}")
      `
    });

    if (!result.success) {
        console.log("Python Output:", result.output);
        console.log("Python Logs:", result.logs);
    }
    
    assert.strictEqual(result.success, true);
    assert.match(result.output, /Success/);
  });
});