# Shadowbox

Cloudflare-native multi-agent platform with a hardened execution path:

- `apps/brain`: orchestration/control plane (chat routing, auth, provider wiring).
- `apps/secure-agent-api`: secure execution/data plane (Durable Objects + Sandbox plugins).
- `apps/web`: React UI.
- `packages/execution-engine`: extracted runtime core (engine, run/task/state, orchestration, planner, agents, llm, cost).

## Architecture

Runtime flow:

`ChatController -> RunEngineRuntime (DO) -> execution-engine runtime modules -> secure-agent-api plugins`

Key invariants:

- `runId` is the execution identity.
- Engine-critical state is DO-backed.
- Runtime extraction is move/refactor based (no behavior rewrite intent).
- CORS is allowlist-driven (no wildcard in production path).

## Workspace

```text
apps/
  brain/
  secure-agent-api/
  web/
packages/
  execution-engine/
  shared-types/
```

## Local Development

```bash
pnpm install
pnpm dev
```

## Quality Gates

```bash
pnpm --filter @shadowbox/brain check-types
pnpm --filter @shadowbox/brain test
pnpm --filter @shadowbox/secure-agent-api check-types
pnpm --filter @shadowbox/secure-agent-api test
pnpm --filter @shadowbox/execution-engine type-check
pnpm --filter @shadowbox/execution-engine test
```

## Phase 3.2 Readiness Gate

```bash
pnpm e2e:phase-3.2
RUN_SECURE_AGENT_API_TESTS=1 RUN_EXECUTION_ENGINE_TESTS=1 pnpm e2e:phase-3.2
```

Operational closure (pre-Phase 4) additionally requires environment smoke + soak verification.

## Security and ADRs

- Security policy: `SECURITY.md`
- ADRs:
  - `docs/adr/ADR-001-single-runtime-source-of-truth.md`
  - `docs/adr/ADR-002-execution-engine-extraction.md`
