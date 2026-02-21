# Shadowbox Web App

Frontend for the Shadowbox workspace experience.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS v4

## Local Development

From the repository root:

```bash
pnpm --filter @shadowbox/web dev
```

## Build

```bash
pnpm --filter @shadowbox/web build
```

## Quality Checks

```bash
pnpm --filter @shadowbox/web lint
pnpm --filter @shadowbox/web check-types
pnpm --filter @shadowbox/web test -- --run
```

## Environment Configuration

Expected environment variables:

- `VITE_BRAIN_BASE_URL`
- `VITE_MUSCLE_BASE_URL`
- `VITE_MUSCLE_WS_URL`

If values are not set in development, local defaults are used and warnings are emitted by `src/lib/platform-endpoints.ts`.

## Provider API Contract

The web app consumes BYOK v2 provider routes through `ProviderApiClient` only:

- `POST /api/byok/providers/connect`
- `POST /api/byok/providers/disconnect`
- `GET /api/byok/providers/connections`
- `GET /api/byok/providers/catalog`
- `POST /api/byok/providers/validate`
- `PATCH /api/byok/preferences`
