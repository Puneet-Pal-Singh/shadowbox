// // test.js
// const API_URL = "http://localhost:8787";

// async function runAgent(code, requirements = []) {
//   console.log(`\n🤖 Sending code to Agent...`);
//   const res = await fetch(`${API_URL}?session=my-senior-agent`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ code, requirements })
//   });
  
//   const data = await res.json();
  
//   if (data.error) {
//     console.error("❌ Error:", data.error);
//   } else {
//     console.log("✅ Output:", data.stdout.join("\n"));
//     if (data.stderr.length) console.log("⚠️ Stderr:", data.stderr.join("\n"));
//   }
// }

// (async () => {
//   // Step 1: Define a variable and save it to disk
//   await runAgent(`
// import json
// data = {"message": "I remember you!"}
// with open("memory.json", "w") as f:
//     json.dump(data, f)
// print("Step 1: Saved data to memory.json")
//   `);

//   // Step 2: Read it back (Proving the container stayed alive)
//   await runAgent(`
// import json
// with open("memory.json", "r") as f:
//     data = json.load(f)
// print(f"Step 2: Read from disk: {data['message']}")
//   `);
// })();


const API_URL = "http://localhost:8787";

async function manualTest() {
  console.log("🧬 Connecting to Agent Runtime...");

  // 1. Define the Python code we want to run
  // We try to import 'json' to prove the environment is standard
  const payload = {
    plugin: "python", // Explicitly telling the runtime to use the Python Plugin
    payload: {
      code: `
import json
import sys

print(f"Hello from Python {sys.version.split()[0]}!")
data = {"status": "alive", "engine": "helix-runtime"}
print(json.dumps(data))
      `
    }
  };

  try {
    const res = await fetch(`${API_URL}?session=manual-demo-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    console.log("\n--- API Response ---");
    console.log(JSON.stringify(data, null, 2));

    if (data.success) {
      console.log("\n✅ Test Passed!");
    } else {
      console.log("\n❌ Test Failed:", data.error);
    }

  } catch (err) {
    console.error("Network Error:", err);
  }
}

manualTest();