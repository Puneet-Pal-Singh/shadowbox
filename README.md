# 📦 Shadowbox: The Open-Source Agent Platform

**Vision:** A secure, cloud-native alternative to Blackbox.ai and Cursor Agents.
**Stack:** Cloudflare Workers (Brain) + Durable Objects (Runtime) + React/Vite (UI).

Shadowbox is an open-source platform for running AI agents in secure sandboxed environments with real-time collaboration capabilities.

## Quick Start

```sh
# Clone the repository
git clone https://github.com/your-username/shadowbox.git
cd shadowbox

# Install dependencies
pnpm install

# Start development
pnpm dev
```

## Architecture

### Apps and Packages

- `apps/secure-agent-api`: Cloudflare Workers-based secure runtime engine with Durable Objects
- `apps/ui`: React/Vite frontend with terminal interface and chat capabilities
- `apps/brain`: AI orchestration layer (coming soon)
- `apps/www`: Landing page and documentation (Astro)
- `packages/ui`: Shared React components
- `packages/eslint-config`: ESLint configurations
- `packages/typescript-config`: TypeScript configurations

### Core Features

✅ **Completed Phases**

- **Monorepo Setup**: Turborepo + pnpm workspaces structure
- **Secure Runtime Engine**: Durable Objects & Sandbox SDK
- **Polyglot Execution**: Dockerized runtime with Python, Node.js, Rust, and Go-Redis
- **Real-time Streaming**: WebSocket implementation for live logs
- **Plugin Architecture**: Modular system for Git, FileSystem, and Code Runners
- **Visual Terminal**: Xterm.js integration with "Cyberpunk" styling
- **Multi-Session Manager**: Tabbed interface for running parallel agents
- **File Explorer**: Visual directory tree syncing with the sandbox

🚧 **In Development**

- **Intelligent Orchestration**: AI-powered reasoning layer
- **Chat-First Interface**: Modern UI like Cursor
- **Git Integration**: Diff views and PR workflows
- **Self-Hosting**: Easy deployment guides

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages, run the following command:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended)
turbo build

# Without [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation), use your package manager
npx turbo build
yarn dlx turbo build
pnpm exec turbo build
```

You can build a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

```
# With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended)
turbo build --filter=docs

# Without [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation), use your package manager
npx turbo build --filter=docs
yarn exec turbo build --filter=docs
pnpm exec turbo build --filter=docs
```

### Develop

To develop all apps and packages, run the following command:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev

# Without [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev
yarn exec turbo dev
pnpm exec turbo dev
```

You can develop a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

```
# With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev --filter=web

# Without [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev --filter=web
yarn exec turbo dev --filter=web
pnpm exec turbo dev --filter=web
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended)
turbo login

# Without [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation), use your package manager
npx turbo login
yarn exec turbo login
pnpm exec turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

```
# With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended)
turbo link

# Without [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation), use your package manager
npx turbo link
yarn exec turbo link
pnpm exec turbo link
```

## Development

### Build

```sh
# Build all apps and packages
pnpm build

# Build a specific app
pnpm build --filter=secure-agent-api
```

### Develop

```sh
# Start all apps in development mode
pnpm dev

# Start a specific app
pnpm dev --filter=ui
```

### Testing

```sh
# Run all tests
pnpm test

# Run tests for a specific package
pnpm test --filter=secure-agent-api
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Useful Links

- [Turborepo Documentation](https://turborepo.dev/docs)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Durable Objects](https://developers.cloudflare.com/workers/learning/using-durable-objects/)

---

## ✅ Completed Tasks

### Foundation Phases

- [x] **Monorepo Setup**: Turborepo + pnpm workspaces structure (`apps/`, `packages/`)
- [x] **Secure Runtime Engine**: `apps/secure-agent-api` with Durable Objects & Sandbox SDK
- [x] **Polyglot Execution**: Dockerized runtime with Python, Node.js, Rust, and Go-Redis
- [x] **Real-time Streaming**: WebSocket implementation for live logs
- [x] **Plugin Architecture**: Modular system for Git, FileSystem, and Code Runners
- [x] **Visual Terminal**: Xterm.js integration with "Cyberpunk" styling
- [x] **Multi-Session Manager**: Tabbed interface for running parallel agents
- [x] **File Explorer**: Visual directory tree syncing with the sandbox
