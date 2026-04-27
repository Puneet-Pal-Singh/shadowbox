# LegionCode Web App

Frontend for the LegionCode public-alpha workspace experience.

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

For staging or production-like deploys, use the deploy build instead:

```bash
pnpm --filter @shadowbox/web build:deploy
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
Deploy builds fail fast when any of the required `VITE_*` endpoint variables are missing.

## Launch Posture

LegionCode is currently shipped as **Public Alpha**.

Recommended public copy:

> LegionCode is in public alpha. Expect rough edges, fast changes, and occasional breakage while the runtime is actively evolving.

## Cloudflare Pages Deploy

The web app is configured for Cloudflare Pages in [wrangler.jsonc](./wrangler.jsonc). SPA deep-link fallback is handled by [public/_redirects](./public/_redirects).

One-time project setup:

```bash
pnpm --filter @shadowbox/web exec wrangler pages project create shadowbox-web
```

Staging deploy flow:

```bash
export VITE_BRAIN_BASE_URL="https://<brain-staging-url>"
export VITE_MUSCLE_BASE_URL="https://<secure-agent-api-staging-url>"
export VITE_MUSCLE_WS_URL="wss://<secure-agent-api-staging-url>"
pnpm --filter @shadowbox/web deploy:staging
```

Production deploy flow (`legioncode.dev`):

```bash
export VITE_BRAIN_BASE_URL="https://brain.legioncode.dev"
export VITE_MUSCLE_BASE_URL="https://api.legioncode.dev"
export VITE_MUSCLE_WS_URL="wss://api.legioncode.dev"
pnpm --filter @shadowbox/web build:deploy
pnpm --filter @shadowbox/web exec wrangler pages deploy --branch main
```

Production domain/OAuth closure checklist:

- Pages project/domain points to `https://legioncode.dev`
- Brain `FRONTEND_URL` is `https://legioncode.dev`
- Brain `GITHUB_REDIRECT_URI` is `https://brain.legioncode.dev/auth/github/callback`
- Secure API `CORS_ALLOWED_ORIGINS` includes `https://legioncode.dev` (and optional staging origin only)

Manual Pages deploy with an explicit branch label:

```bash
pnpm --filter @shadowbox/web build:deploy
pnpm --filter @shadowbox/web exec wrangler pages deploy --branch <branch-name>
```

## Provider API Contract

The web app consumes provider routes through `ProviderApiClient` only:

- `POST /api/byok/providers/connect` (provider API path)
- `POST /api/byok/providers/disconnect`
- `GET /api/byok/providers/connections`
- `GET /api/byok/providers/catalog`
- `POST /api/byok/providers/validate`
- `PATCH /api/byok/preferences`
