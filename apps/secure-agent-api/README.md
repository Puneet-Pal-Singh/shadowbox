# Agent Runtime (Cloudflare)

A stateful, plugin-based Edge Runtime for AI Agents, built on **Cloudflare Workers**, **Durable Objects**, and the **Sandbox SDK**.

Unlike standard ephemeral sandboxes, this runtime provides **persistent sessions**, allowing agents to maintain state (variables, files, dependencies) across multiple requests.

## Features

- **Persistent Sessions**: Uses Durable Objects to keep the sandbox environment alive between HTTP requests.
- **Plugin Architecture**: Modular design separating the core runtime from language implementations (`src/plugins/`).
- **Python Runtime**: Pre-configured environment with `pip` support for dynamic dependency installation.
- **Stateful Filesystem**: Files written to the sandbox persist as long as the session is active.

## Architecture

This project moves beyond simple script execution by implementing a **Session Manager** pattern:

1. **Worker (`index.ts`)**: Routes incoming requests to the specific Durable Object ID (Session).
2. **Runtime (`AgentRuntime.ts`)**: Manages the Sandbox lifecycle and loads active plugins.
3. **Plugins (`PythonPlugin.ts`)**: Handles language-specific logic, dependency management, and execution.

## API Reference

The runtime accepts `POST` requests containing a selected plugin and its payload.

### Endpoint
`POST http://localhost:8787/?session=<SESSION_ID>`

### 1. Execute Python Code
Run Python scripts with persistent memory.

**Request:**
```json
{
  "plugin": "python",
  "payload": {
    "code": "print('Hello from the Edge!')"
  }
}
```

**Response:**
```json
{
  "success": true,
  "output": "Hello from the Edge!\n",
  "logs": []
}
```

### 2. Install Dependencies & Persist State
Install libraries and save files. The next request to the same `session` ID can access them.

**Request:**
```json
{
  "plugin": "python",
  "payload": {
    "requirements": ["requests"],
    "code": "import requests; import json; data = {'status': 200}; print(json.dumps(data))"
  }
}
```

## Setup & Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Local Development**
   ```bash
   npm run dev
   ```
   *Note: The first run will build the Docker container (approx. 2-3 minutes). Subsequent runs are instant.*

3. **Run Integration Tests**
   We use a comprehensive test suite to verify persistence and plugin logic.
   ```bash
   npm test
   ```

## Project Structure

```text
src/
├── core/
│   └── AgentRuntime.ts    # The Durable Object (Session Manager)
├── plugins/
│   └── PythonPlugin.ts    # Python execution logic
├── interfaces/
│   └── types.ts           # Shared type definitions
└── index.ts               # Worker Entrypoint
```

## Deploy

```bash
npm run deploy
```
