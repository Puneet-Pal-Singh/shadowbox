// Test script to debug streaming
fetch("http://localhost:8788/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [{ role: "user", content: "hi" }],
    sessionId: "test",
    runId: "test-agent",
  }),
}).then(async (response) => {
  const reader = response.body?.getReader();
  if (!reader) {
    console.error("No reader");
    return;
  }

  console.log("Stream started, reading chunks...");
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log("Stream complete, total chunks:", chunkCount);
      break;
    }

    const text = new TextDecoder().decode(value);
    chunkCount++;
    console.log(`Chunk ${chunkCount}:`, text.substring(0, 100));
  }
});
