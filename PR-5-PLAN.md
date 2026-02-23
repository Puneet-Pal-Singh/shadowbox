# PR-5: BYOK v3 Migration, Observability, and Feature Flags

## Objective

Complete Phase 5 of BYOK v3 implementation by adding:
1. v2→v3 migration execution with dual-read support
2. Provider expansion scaffolding (10+ initial providers)
3. Observability infrastructure (metrics, structured logging, alerts)
4. Feature flags for gradual rollout

## Context

- **PR-4 Complete**: Web-side BYOK v3 infrastructure ✅
- **PR-3 Complete**: Backend v3 endpoints + vault encryption ✅
- **This PR (PR-5)**: Backend migration, observability, feature flags

## Implementation Breakdown

### 1. Feature Flag Infrastructure

**File**: `apps/brain/src/core/features/FeatureFlagService.ts`

- Centralized feature flag provider
- Flags:
  - `BYOK_V3_ENABLED` (default: false for gradual rollout)
  - `BYOK_MIGRATION_ENABLED` (default: true when v3 enabled)
  - `BYOK_MIGRATION_CUTOVER` (default: false until metrics stable)
- Config from env: `FEATURE_FLAGS_*` or Durable Object

**Dependencies**:
- Existing CloudflareService for D1/KV

### 2. Migration Service

**File**: `apps/brain/src/services/byok/MigrationService.ts`

#### 2.1 Dual-Read Adapter (ByokDualReadAdapter)

- Tries v3 first
- Falls back to v2 if v3 returns not found
- Tracks read source (v3 vs v2) for observability
- Routes all writes to v3 only

**Methods**:
- `getCredentials()` — v3 first, v2 fallback
- `getPreferences()` — v3 first, v2 fallback
- `connectCredential()` — write to v3 only

#### 2.2 Background Migrator (ByokBackgroundMigrator)

- Runs periodically (or triggered manually)
- Finds all v2 credential records
- Converts them to v3 schema
- Encrypts with v3 encryption key
- Inserts into v3 table
- Tracks migration progress (X/Y completed)
- Idempotent (dedups by v2 ID + user + workspace)

**Flow**:
```
SELECT * FROM v2_provider_connections WHERE migrated_at IS NULL
FOR EACH record:
  - Decrypt v2 secret
  - Encrypt with v3 key + versioning
  - INSERT into byok_credentials
  - UPDATE v2 table SET migrated_at
  - Emit audit event
```

### 3. Observability Infrastructure

**File**: `apps/brain/src/core/observability/ByokObservability.ts`

#### 3.1 Metrics

Use Cloudflare Analytics Engine or custom KV tracking:

- `byok_connect_total{provider,status,source}` — Connection attempts
- `byok_validate_total{provider,mode,status}` — Validation operations
- `byok_resolve_total{result,source}` — Resolution calls
- `byok_resolve_latency_ms{provider}` — Latency histogram
- `byok_migration_progress{status}` — Migration execution status
- `chat_provider_resolution_fail_total` — Chat failures due to resolution

#### 3.2 Structured Logging

Extend `LogSanitizer` to emit structured logs with:
- `correlationId`
- `userId`
- `workspaceId`
- `providerId`
- `credentialId` (without secrets)
- `operation` (connect/validate/resolve/migrate)
- `status` (success/failure)
- `latencyMs`
- Error details (code, message, retryable)

**File**: `apps/brain/src/core/security/ByokLogContext.ts`

#### 3.3 Alerts

Alert conditions (Sentry / Datadog compatible):
- `byok_resolve_failure_rate > 1%` for 5min
- `byok_connect_failures > 2x baseline`
- `byok_live_validation_timeout_rate > 5%`
- `byok_migration_failure_surge`

### 4. Provider Expansion Scaffolding

**File**: `apps/brain/src/services/providers/ProviderRegistry.ts`

Extend provider registry to support 10+ providers without schema changes:

```typescript
const PROVIDER_REGISTRY: Record<string, ProviderRegistryEntry> = {
  openai: { ... },
  anthropic: { ... },
  groq: { ... },
  openrouter: { ... },
  cohere: { ... },
  huggingface: { ... },
  replicate: { ... },
  deepseek: { ... },
  mistral: { ... },
  xai: { ... },
};
```

Each entry includes:
- `providerId`, `displayName`
- `authModes` (api_key, oauth)
- `capabilities` (streaming, tools, jsonMode, structuredOutputs)
- `defaultModel`
- Model list source (static vs remote URL)

### 5. Rate Limiting & Abuse Controls

**File**: `apps/brain/src/core/ratelimit/ByokRateLimiter.ts`

Per-user-workspace-provider limits:
- Connect: `10/min`
- Validate live: `30/min`
- Resolve: `300/min`

Use Durable Object for distributed rate limit state.

## Atomic Commits

1. **Commit 1**: Feature flag service + infrastructure
2. **Commit 2**: Dual-read adapter + migration service
3. **Commit 3**: Observability infrastructure (metrics, logging, alerts)
4. **Commit 4**: Provider registry expansion scaffolding
5. **Commit 5**: Rate limiting service + integration tests

## Testing

### Unit Tests
- Feature flag service behavior
- Dual-read fallback logic
- Migration idempotency and progress tracking
- Metrics/logging emission
- Provider registry lookups

### Integration Tests
- E2E migration with v2→v3 conversion
- Dual-read behavior with real D1 tables
- Rate limiter enforcement
- Observability event collection

### Load Tests (Phase 6, but prepare here)
- 1M credentials migration time
- Concurrent connect/validate/resolve under rate limits

## Files to Create/Modify

### New Files
- `apps/brain/src/core/features/FeatureFlagService.ts`
- `apps/brain/src/core/features/FeatureFlagService.test.ts`
- `apps/brain/src/services/byok/MigrationService.ts`
- `apps/brain/src/services/byok/MigrationService.test.ts`
- `apps/brain/src/services/byok/ByokDualReadAdapter.ts`
- `apps/brain/src/core/observability/ByokObservability.ts`
- `apps/brain/src/core/observability/ByokObservability.test.ts`
- `apps/brain/src/core/security/ByokLogContext.ts`
- `apps/brain/src/services/providers/ProviderRegistry.ts`
- `apps/brain/src/services/providers/ProviderRegistry.test.ts`
- `apps/brain/src/core/ratelimit/ByokRateLimiter.ts`
- `apps/brain/src/core/ratelimit/ByokRateLimiter.test.ts`

### Modified Files
- `apps/brain/src/controllers/ProviderController.ts` — Add feature flag guards
- `apps/brain/src/services/byok/index.ts` — Export new services
- `apps/brain/src/index.ts` — Register feature flags at startup

## Success Criteria

- [ ] Feature flag service operational and toggleable via env
- [ ] Dual-read adapter correctly falls back from v3 to v2
- [ ] Background migrator completes 1M records in < 2 hours with idempotency
- [ ] Structured logs emit with all required fields and no secrets
- [ ] Metrics captured for all BYOK operations
- [ ] Provider registry supports 10+ providers without schema changes
- [ ] Rate limits enforced and observable
- [ ] All 50+ new tests passing
- [ ] Zero plaintext secret leakage in logs/traces

## Related Documents

- `plans/codex-like-app/Top-version/43-BYOK-V3-WEB-BACKEND-REARCHITECTURE-PLAN.md` (PR-E scope)
- `plans/codex-like-app/Top-version/44-BYOK-V3-SCALE-100K-LLD.md` (Sections 11-15)

## Timeline

Estimated 3-4 days for full implementation + testing + review.
