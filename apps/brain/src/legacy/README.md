# ⚠️ LEGACY CODE - DO NOT USE IN ACTIVE RUNTIME

## Status

This directory contains **deprecated** code from the orchestration-era architecture (pre-M1.3).

## Contents

- `providers/` - Legacy provider implementations (OpenAI, Anthropic, Cloudflare)
- `registry.ts` - Legacy MODEL_REGISTRY for the old orchestration system

## Why These Are Legacy

The active runtime now uses:
- **Execution Engine** (`@shadowbox/execution-engine`) for all provider/model interactions
- **ProviderConfigService** for configuration management
- **Runtime-agnostic abstractions** instead of provider-specific implementations

## Import Restrictions

❌ **DO NOT** import from this directory in:
- Active runtime code
- New features
- ChatController or execution path
- Any code executed during normal operation

✅ **MAY** import from this directory in:
- Migration scripts
- Documentation references
- Historical analysis

## Removal Timeline

These files are scheduled for complete removal in **M2.0** (target: Q2 2026).

## If You Need Provider Functionality

Use the canonical path:
```typescript
// ✅ CORRECT: Use execution-engine runtime
import { RunEngine } from "@shadowbox/execution-engine";

// ❌ WRONG: Do not use legacy providers
import { OpenAIProvider } from "./legacy/providers/openai";
```

## Contact

For questions about migration, see:
- HLD: `local/tasks/roadmap_v2_hlds/05c-M1.3c-Brain-Integration-Dedup-Closure-HLD.md`
- LLD: `local/tasks/roadmap_v2_llds/05c-M1.3c-Brain-Integration-Dedup-Closure-LLD.md`
