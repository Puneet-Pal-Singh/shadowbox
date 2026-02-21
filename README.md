# Shadowbox

Web-native, multi-agent coding workspace built on Cloudflare runtime primitives.

## Repository Layout

```text
apps/
  web/               # React + Vite frontend
  brain/             # Orchestration and API boundary
  secure-agent-api/  # Sandbox execution + session API

packages/
  execution-engine/  # Runtime execution engine
  shared-types/      # Cross-app contracts
  ...
```

## Prerequisites

- Node.js `>=18`
- pnpm `>=9`

## Bootstrap

```bash
pnpm install
pnpm dev
```

Run individual apps:

```bash
pnpm --filter @shadowbox/web dev
pnpm --filter @shadowbox/brain dev
pnpm --filter @shadowbox/secure-agent-api dev
```

## Local Verification Workflow

Run the same baseline gates we enforce in CI:

```bash
pnpm lint
pnpm check-types
pnpm check:boundaries
pnpm --filter @shadowbox/web test -- --run
pnpm --filter @shadowbox/brain test
pnpm --filter @shadowbox/secure-agent-api test
pnpm --filter @shadowbox/execution-engine test
pnpm build
```

## Architecture and Contract Ownership

- `apps/brain` owns public API boundary contracts.
- `packages/shared-types` is the canonical cross-app schema source.
- `packages/execution-engine` owns runtime execution policy and adapter orchestration.
- Provider/model ownership and compatibility rules are documented in:
  - `apps/brain/src/services/ai/PROVIDER_INTEGRATION_MATRIX.md`
  - `docs/adr/ADR-003-provider-contract-ownership-and-matrix.md`

## Documentation and Governance

- Contribution guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Security policy: `SECURITY.md`
- License: `LICENSE`
- Architecture decisions: `docs/adr/`
