import WebSocket from 'ws';

const API_URL = "http://localhost:8787";
const WS_URL = "ws://localhost:8787";
const SESSION_ID = "stream-test-1";

async function runRealTimeTest() {
  console.log(`🔌 Connecting to WebSocket (${SESSION_ID})...`);
  
  // 1. Open the Real-time Channel
  const ws = new WebSocket(`${WS_URL}/connect?session=${SESSION_ID}`);

  ws.on('open', async () => {
    console.log("✅ WebSocket Connected!");

    // 2. Trigger a slow Python task via HTTP
    console.log("🚀 Sending Python command (HTTP POST)...");
    
    // We run a loop to generate multiple log lines
    const payload = {
      plugin: "python",
      payload: {
        code: `
import time
print("Step 1: Warming up engines...")
time.sleep(1)
print("Step 2: Connecting to satellite...")
time.sleep(1)
print("Step 3: Download complete.")
        `
      }
    };

    // The HTTP request will return the final result, 
    // BUT the WebSocket should show us the logs AS THEY HAPPEN.
    const res = await fetch(`${API_URL}?session=${SESSION_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const final = await res.json();
    console.log("\n🏁 HTTP Final Response:", final.success ? "Success" : "Failed");
    
    // Close WS after a brief delay to ensure we got everything
    setTimeout(() => ws.close(), 1000);
  });

  // 3. Listen for Streaming Logs
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    
    if (msg.type === 'log') {
        // Print logs nicely with a timestamp
        process.stdout.write(`[STREAM] ${msg.data}`); // use write to avoid extra newlines if raw
    } else if (msg.type === 'start') {
        console.log(`\n🟢 Started: ${msg.data.plugin}`);
    } else if (msg.type === 'finish') {
        console.log(`🔴 Finished (Success: ${msg.data.success})`);
    } else {
        console.log("Unknown Event:", msg);
    }
  });

  ws.on('error', (err) => console.error("WS Error:", err));
}

runRealTimeTest();