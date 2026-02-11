# Shadowbox: Brain & Muscle Explained

## Simple Analogy

Think of Shadowbox like a **person trying to solve a coding problem**:

- **Brain** = The thinking part. Makes decisions, plans, talks to the AI models.
- **Muscle** (secure-agent-api) = The doing part. Executes commands, reads files, runs git operations.

The brain says "Let's implement authentication" → The muscle implements it.

---

## 1. @apps/brain - The Decision Maker

### What It Does

**Brain is a web server that thinks and decides what to do.**

It runs on Cloudflare Workers (a serverless platform). Its job:

1. **Listen for user requests** — "Hey, I want to implement a feature"
2. **Talk to AI models** (OpenAI, Anthropic, Google) — "AI, what should we do?"
3. **Assemble context** — Gather information about the repo, previous decisions
4. **Make decisions** — Decide which tools to call, which steps to take
5. **Send commands to Muscle** — Tell the muscle what code to execute

### What Brain CANNOT Do

❌ Read files from disk  
❌ Execute commands  
❌ Write to the filesystem  
❌ Run git operations  
❌ Access the Sandbox  

It only **thinks and decides**.

### Brain's Internal Structure

```
apps/brain/src/
├── controllers/
│   ├── ChatController.ts      # Handles chat messages
│   ├── AuthController.ts      # Handles authentication
│   ├── GitHubController.ts    # Handles GitHub integration
│   └── GitController.ts       # Handles git operations
│
├── orchestrator/              # Plans and coordinates work
│   └── Decision logic
│
├── providers/                 # AI model integration
│   ├── OpenAI
│   ├── Anthropic
│   └── Google
│
├── services/                  # Business logic
│   └── Processing
│
└── lib/                       # Utilities
    ├── CORS (cross-origin)
    └── Helpers
```

### Example: What Brain Does

```
User: "Implement login functionality"
   ↓
Brain receives request
   ↓
Brain calls AI: "What should we do to implement login?"
   ↓
AI responds: "We should: 1) Create auth module, 2) Add routes, 3) Add tests"
   ↓
Brain assembles plan
   ↓
Brain sends to Muscle: "Execute these steps"
```

---

## 2. @apps/secure-agent-api - The Executor (The Muscle)

### What It Does

**Muscle is a sandboxed environment that executes code safely.**

It runs on Cloudflare Durable Objects (persistent, isolated servers). Its job:

1. **Receive commands from Brain** — "Create this file", "Run this git command"
2. **Execute them safely** — In a sandbox (isolated environment)
3. **Protect the main system** — Malicious code can't escape
4. **Return results to Brain** — "I created the file, here's the result"
5. **Manage tools** — File operations, git commands, bash execution

### What Muscle CAN Do

✅ Read files from disk  
✅ Write files  
✅ Run bash/shell commands  
✅ Execute git operations  
✅ Access the filesystem  
✅ Run code in sandbox  
✅ Manage project state  

### Why It's Called "Secure"

The "secure" part means:
- **Sandboxed** — Code runs in isolation, can't crash the main system
- **Controlled** — Brain decides what gets executed, not random input
- **Monitored** — All operations are logged and tracked
- **Safe from escapes** — Can't break out and access other systems

### Muscle's Internal Structure

```
apps/secure-agent-api/src/
├── core/
│   └── AgentRuntime.ts         # Main execution engine
│
├── interfaces/                 # Type definitions
│   └── API contracts
│
├── plugins/                    # Tool implementations
│   ├── ReadFileTool
│   ├── WriteFileTool
│   ├── GitTool
│   ├── BashTool
│   └── (More tools)
│
├── schemas/                    # Data validation
│   └── Input/output schemas
│
├── services/                   # Support logic
│   └── Tool execution
│
└── index.ts                    # Main entry point
```

### Example: What Muscle Does

```
Brain sends: "Create file src/auth.ts with this content"
   ↓
Muscle receives in sandbox
   ↓
Muscle validates the request
   ↓
Muscle creates the file
   ↓
Muscle returns: "File created successfully"
   ↓
Brain receives result and continues
```

---

## 3. How Brain & Muscle Work Together

### The Communication Flow

```
┌─────────────────────────────────────────────┐
│              USER                            │
└─────────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│         BRAIN (Cloudflare Worker)           │
│  - Listens for user input                   │
│  - Calls AI models                          │
│  - Makes decisions                          │
│  - Sends commands                           │
└─────────────────────────────────────────────┘
            ↓                      ↑
          (command)            (result)
            ↓                      ↑
┌─────────────────────────────────────────────┐
│    MUSCLE (Durable Object Sandbox)          │
│  - Receives commands                        │
│  - Executes safely                          │
│  - Runs tools                               │
│  - Sends results back                       │
└─────────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│       FILESYSTEM / SANDBOX                   │
│  - Files read/written                       │
│  - Git operations                           │
│  - Commands executed                        │
└─────────────────────────────────────────────┘
```

### Conversation Example

**User**: "Implement a login button"

1. **Brain** receives the message
2. **Brain** calls OpenAI API: "What steps should we take to add a login button?"
3. **OpenAI** responds: "1) Create LoginButton component, 2) Add styling, 3) Add tests"
4. **Brain** creates a plan: "Execute these 3 steps"
5. **Brain** sends to **Muscle**: "Step 1: Create LoginButton.tsx with this code"
6. **Muscle** executes: Creates the file in the sandbox
7. **Muscle** responds: "File created at src/components/LoginButton.tsx"
8. **Brain** receives result
9. **Brain** sends next command: "Step 2: Add styling..."
10. **Muscle** executes: Adds styling
11. Process repeats for step 3 (tests)
12. **Brain** tells user: "Done! Created LoginButton component with styling and tests"

---

## 4. Why Separate Brain and Muscle?

### Security

- **Brain** handles user input and AI decisions (could be untrusted)
- **Muscle** runs in isolated sandbox (can't harm main system)
- If user asks for something malicious, muscle sandboxing protects the system

### Scalability

- **Brain** processes thinking/planning (lightweight, many instances)
- **Muscle** handles heavy work (execute once, results cached)
- Can run multiple brains but share one muscle

### Reliability

- If **Brain** crashes, muscle keeps working
- If **Muscle** crashes, just spin up a new one
- Failures are isolated

### Clarity

- Clear separation of concerns
- Brain = "What to do?"
- Muscle = "How to do it?"

---

## 5. Real-World Example: "Fix a TypeScript Error"

### Step-by-Step Execution

```
USER:
  "I have a TypeScript error in src/api.ts. Fix it."

╔═══════════════════════════════════════════╗
║          BRAIN PHASE (Thinking)           ║
╚═══════════════════════════════════════════╝

1. Brain receives request
2. Brain calls Muscle: "Read src/api.ts"
   → Muscle returns: File content with error
3. Brain calls AI: "Here's the error: ..., how do I fix it?"
   → AI: "Line 42 is missing type annotation. Fix it like this..."
4. Brain creates plan:
   - Read current file
   - Apply fix
   - Type-check
   - Return results
5. Brain sends to Muscle: "Replace line 42 with this code"

╔═══════════════════════════════════════════╗
║         MUSCLE PHASE (Execution)          ║
╚═══════════════════════════════════════════╝

1. Muscle receives: "Replace line 42"
2. Muscle reads current file
3. Muscle applies fix
4. Muscle runs TypeScript checker
5. Muscle returns: "✅ Fixed! File now compiles."

╔═══════════════════════════════════════════╗
║          BRAIN PHASE (Response)           ║
╚═══════════════════════════════════════════╝

1. Brain receives success
2. Brain tells user: "Fixed the TypeScript error on line 42"
```

---

## 6. Key Concepts Explained

### Cloudflare Workers (Brain)

**What it is**: A serverless JavaScript runtime that runs your code globally

**Why used for Brain**:
- Fast (runs on Cloudflare's edge network)
- Always available (distributed)
- Perfect for decision-making / API calls
- Can talk to external services (AI APIs)

### Durable Objects (Muscle)

**What it is**: Persistent, isolated environments that maintain state

**Why used for Muscle**:
- Safe isolation (sandboxing)
- Can access filesystem (sandbox filesystem)
- Maintains session state
- One instance per agent/user (can't interfere with others)

### Sandbox

**What it is**: An isolated environment where code runs safely

**What it prevents**:
- ❌ Can't access your machine
- ❌ Can't access other users' files
- ❌ Can't access the internet without permission
- ❌ Can't crash the main system
- ✅ Can only do what we explicitly allowed

---

## 7. What Each App Knows About the Other

### Brain Knows:

- ✅ How to call Muscle (HTTP requests / RPC)
- ✅ What tools Muscle supports (read, write, bash, git)
- ✅ Expected response format
- ✅ Timeout/retry logic

### Brain DOESN'T Know:

- ❌ How Muscle actually executes
- ❌ What's running in the sandbox
- ❌ Low-level implementation details

### Muscle Knows:

- ✅ How to execute tools safely
- ✅ What the sandbox allows
- ✅ How to return results

### Muscle DOESN'T Know:

- ❌ Who the user is
- ❌ What decision Brain made
- ❌ What the final goal is (just executes commands)

---

## 8. Example API Calls

### Brain → Muscle: Read a File

```typescript
// Brain sends request to Muscle:
const response = await fetch('http://muscle/tool', {
  method: 'POST',
  body: JSON.stringify({
    tool: 'readFile',
    args: {
      path: 'src/api.ts'
    }
  })
})

// Muscle responds:
{
  success: true,
  output: "import express from 'express';\n...",
  duration: 45
}
```

### Brain → Muscle: Execute Command

```typescript
// Brain sends request to Muscle:
const response = await fetch('http://muscle/tool', {
  method: 'POST',
  body: JSON.stringify({
    tool: 'runCommand',
    args: {
      command: 'npm test',
      timeout: 30000
    }
  })
})

// Muscle responds:
{
  success: true,
  output: "✅ All tests passed\n...",
  exitCode: 0,
  duration: 2500
}
```

---

## 9. Summary: What You Need to Know

| Aspect | Brain | Muscle |
|---|---|---|
| **Runs on** | Cloudflare Workers | Cloudflare Durable Objects |
| **Does** | Thinks, plans, decides | Executes, reads, writes |
| **Can access** | AI APIs, user input | Filesystem, sandbox |
| **Can't do** | File operations | AI decision-making |
| **Purpose** | "What should we do?" | "Do this specific thing" |
| **Security** | Validates decisions | Executes safely in sandbox |
| **Speed** | Think once, execute many | Fast execution |
| **Isolation** | Shared (all users) | Isolated per user |

---

## 10. Phase 2.1 Integration

The `@shadowbox/execution-engine` (Phase 2.1) is designed to be **Muscle's brain**.

When Muscle needs to execute a plan:

```
User Request
   ↓
Brain (decides)
   ↓
Muscle (receives command)
   ↓
PlanExecutionEngine (orchestrates multi-step execution)
   ↓
Tools (read file, write file, bash, git)
   ↓
Results back to Brain
```

The execution engine ensures:
- ✅ Deterministic behavior (same input = same output)
- ✅ Safe tool execution (validation, timeout)
- ✅ Complete state tracking (artifacts, logs)
- ✅ Error recovery (graceful failure)

---

## Conclusion

**Brain** = The smart part (thinks, plans, decides)  
**Muscle** = The safe part (executes, reads, writes)

Together they form a **thinking + doing system** that can:
- Make intelligent decisions (Brain)
- Execute them safely (Muscle)
- Handle errors gracefully (both)
- Scale across users (isolation)
- Never crash the main system (sandboxing)

This separation is what makes Shadowbox **safe, scalable, and intelligent**.
