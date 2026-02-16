# Shadowbox

Open-source agentic coding workspace for multi-session AI development.

## Monorepo

```text
apps/
  web/
  brain/
  secure-agent-api/

packages/
  execution-engine/
  shared-types/
  context-assembly/
  repo-awareness/
  token-budgeting/
  ...
```

## Quickstart

Requirements:

- Node.js `>=18`
- pnpm `>=9`

Install and run:

```bash
pnpm install
pnpm dev
```

Build:

```bash
pnpm build
```

## Development

Run by app:

```bash
pnpm --filter @shadowbox/web dev
pnpm --filter @shadowbox/brain dev
pnpm --filter @shadowbox/secure-agent-api dev
```

Typecheck and tests:

```bash
pnpm check-types
pnpm --filter @shadowbox/brain test
pnpm --filter @shadowbox/secure-agent-api test
pnpm --filter @shadowbox/execution-engine test
```

Optional readiness script:

```bash
pnpm e2e:phase-3.2
```

## Security

See `SECURITY.md`.

## Status

Active development.
