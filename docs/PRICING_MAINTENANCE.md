# Pricing Data Maintenance Guide

## Overview

The `packages/execution-engine/src/pricing/pricing.json` file contains static pricing data for various LLM providers. **This is an MVP solution and requires regular updates.**

## Current Status

- **Last Updated**: February 12, 2026
- **Provider Coverage**: OpenAI, Anthropic, Groq, Ollama
- **Models**: Limited set for MVP testing
- **Deprecation Timeline**: Phase 3 will replace with dynamic pricing

## Update Requirements

### Update Frequency

- **Policy**: Every 90 days maximum
- **Critical Threshold**: 180 days (system will error if exceeded)
- **Recommended**: Monthly checks for OpenAI/Anthropic (prices change frequently)

### When to Update

1. **Provider announces price changes** → Update immediately
2. **New models released** → Add to pricing.json
3. **Models deprecated** → Remove from pricing.json
4. **Quarterly review cycle** → Verify all prices are current

## How to Update pricing.json

### 1. Get Current Pricing

Official pricing sources:
- OpenAI: https://openai.com/pricing
- Anthropic: https://www.anthropic.com/pricing
- Groq: https://groq.com/pricing (usually free)
- Ollama: https://ollama.ai (self-hosted, free)

### 2. Update Format

```json
{
  "_metadata": {
    "version": "1.0",
    "lastUpdated": "2026-02-12T00:00:00Z",  // ← Update to TODAY
    "stalePolicyDays": 90,
    "deprecationWarning": "...",
    "note": "..."
  },
  "provider": {
    "model-name": {
      "model": "model-name",
      "provider": "provider",
      "inputPer1k": 0.005,      // Cost per 1K input tokens
      "outputPer1k": 0.015,     // Cost per 1K output tokens
      "lastUpdated": "2026-02-12T00:00:00Z",  // ← Update to TODAY
      "currency": "USD"
    }
  }
}
```

### 3. Steps to Update

1. Open `pricing.json`
2. Update `_metadata.lastUpdated` to today's date (ISO format)
3. For each changed model:
   - Update `inputPer1k` and `outputPer1k` with current prices
   - Update model's `lastUpdated` to today's date
4. Add any new models
5. Remove deprecated models
6. Run tests: `npm run test -- pricing-provider.test.ts`
7. Commit: `chore: update pricing data for YYYY-MM-DD`

### 4. Example Commit

```bash
git add packages/execution-engine/src/pricing/pricing.json
git commit -m "chore: update LLM pricing data - Feb 2026

- OpenAI: gpt-4o now \$0.006 input (was \$0.005)
- Anthropic: claude-3-opus now \$0.020 input (was \$0.015)
- Groq: llama3-70b still free
- Added: gpt-4o-mini model support
- Removed: gpt-4-turbo (deprecated)"
```

## Staleness Warnings

### Warning Level (>90 days)

```
[pricing/static] WARNING: Pricing data is 120 days old (policy: 90 days). 
Last updated: 2025-11-15T00:00:00Z. 
Consider updating or switching to dynamic pricing in Phase 3.
```

**Action**: Update pricing.json within 30 days

### Critical Level (>180 days)

```
[pricing/static] CRITICAL: Pricing data is 200 days old and critically stale.
Phase 3 must implement dynamic pricing (LiteLLM, API fetcher) before production use.
```

**Action**: SYSTEM WILL ERROR. Must update pricing.json immediately or implement dynamic pricing.

## Phase 2.5 vs Phase 3

### Phase 2.5 (Current - MVP)
- Static pricing in JSON
- Manual updates required
- Staleness warnings
- Good for development/testing
- **NOT for production at scale**

### Phase 3 (Planned)
- Dynamic pricing via LiteLLM API
- Auto-updates, no manual work
- Real-time pricing for 100+ models
- Production-ready
- Deprecates static JSON

## Code Changes When Updating

If you only update `pricing.json`:
- ✅ No code changes needed
- ✅ Tests automatically validate new data
- ✅ Constants in tests are provider/model-agnostic

If you add new providers or models:
- May need to update test fixtures (optional)
- Test assertions use `expect.any(String)` so they're flexible
- Add comments in `pricing.json` if needed

## Monitoring

### Check Pricing Age

```typescript
// StaticPricingProvider will log on init:
// [pricing/static] WARNING: Pricing data is 120 days old...
```

### Implement Alerting (Future)

For production, add:
- Scheduled job to check `_metadata.lastUpdated`
- Alert if >60 days old (before warning threshold)
- Auto-disable pricing if >180 days old
- Integration with observability tools

## Future: Dynamic Pricing (Phase 3)

Migration plan:
1. Implement `LiteLLMPricingProvider`
2. Fetch from LiteLLM API
3. Cache with TTL (24 hours)
4. Keep JSON as fallback
5. Remove static maintenance requirement

## Questions?

Refer to:
- Cost tracking HLD: `tasks/cost-tracking-HLD.md`
- Cost tracking issue: `tasks/Cost-tracking-Issue.md`
- CostCalculator source: `packages/execution-engine/src/cost/CostCalculator.ts`
- StaticPricingProvider: `packages/execution-engine/src/pricing/StaticPricingProvider.ts`
