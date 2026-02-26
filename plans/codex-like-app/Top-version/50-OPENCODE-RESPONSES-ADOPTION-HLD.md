# 50 - OpenCode Responses Adoption HLD

## Objective

Stabilize chat responses first, then adopt OpenCode-style response behavior incrementally without breaking Shadowbox safety boundaries.

This plan is a bridge between:
1. `49-BYOK-UNBLOCK-TO-PROVIDER-AGNOSTIC-MASTER-PLAN.md`
2. `OPENCODE-ADOPTION-PLAN.md`

## Problem Statement

Current runtime still over-routes simple conversational turns into planning/tool execution in edge cases.

Observed risks:
1. brittle intent gating logic across layers,
2. delayed user-visible feedback during tool phases,
3. inconsistent execution status mapping,
4. reduced confidence to proceed with BYOK phases.

## Design Principles

1. Runtime correctness before architecture expansion.
2. One stable contract for response events and errors.
3. Keep runId isolation, sandbox allowlists, and budget enforcement intact.
4. Introduce agentic capabilities behind flags and gates, not big-bang rewrites.

## Target Architecture (Incremental)

1. Layer A: Deterministic conversation routing for short conversational turns.
2. Layer B: Event-first response stream envelope for text/tool/progress/error.
3. Layer C: Bounded agentic loop for tool chaining with hard stop conditions.
4. Layer D: Provider-agnostic behavior parity across OpenAI/OpenRouter/Groq/Anthropic paths.

## Scope

In scope:
1. response routing and chat reliability,
2. event envelope and stream visibility,
3. scheduler/result correctness,
4. BYOK-safe integration points.

Out of scope:
1. multi-agent orchestration redesign,
2. memory system expansion beyond existing checkpoints,
3. broad UI redesign unrelated to response correctness.

## PR Sequence (from `dev`)

1. PR-50A: Chat reliability hardening.
2. PR-50B: Response event envelope and UI stream visibility.
3. PR-50C: Bounded agentic tool loop behind feature flag.
4. PR-50D: Cross-provider parity tests and contract freeze for response behavior.

## Architectural Constraints

1. Keep `runId` as the only execution identifier.
2. Keep strict command safety and workspace jailing in secure-agent-api.
3. Preserve budget preflight and post-commit cost tracking.
4. Preserve typed error envelopes and remove silent fallbacks.

## Success Gates

1. `hey` and `great` never trigger tool planning.
2. `read this readme` triggers tools exactly when requested.
3. tool failures surface as failed status, not DONE summaries.
4. stream emits deterministic event sequence for text/tool/error.
5. BYOK provider switch does not change chat routing semantics.

## Merge Policy

1. All adoption PRs branch from `dev`.
2. `main` merge only after reliability gates and parity matrix pass.
3. BYOK progression continues only after PR-50A and PR-50B gates are green.
