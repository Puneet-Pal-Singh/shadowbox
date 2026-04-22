# ADR-004: Plan 116 Sandbox Git and Artifacts Scope

## Status
Accepted

## Date
2026-04-19

## Context
Plan 116 requires an explicit adopt/defer decision for Cloudflare Sandbox Git helpers and Artifacts so shell-first Git autonomy can ship without scope drift.

## Decision
1. Adopt now: keep shell-first Git execution as the canonical runtime path for local repo work.
2. Adopt now: keep bootstrap readiness explicit in runtime metadata so workspace-prep state is observable and recoverable.
3. Defer now: do not integrate Sandbox SDK `gitCheckout()` or backup/restore into the plan-116 critical path.
4. Defer now: keep Artifacts and ArtifactFS out of plan-116 implementation scope.

## Rationale
1. The launch blocker is runtime autonomy and recovery behavior, not repository cloning primitives.
2. Shell-first + connector-first metadata routing closes the user-visible reliability gap immediately.
3. Sandbox Git helpers and Artifacts are valuable for warm-start optimization, but are not required to meet plan-116 acceptance criteria for lane strategy and recoverable failures.

## Non-Goals
1. No migration to Artifacts-backed workspace persistence in this milestone.
2. No replacement of typed git tools; they remain accelerators.
3. No finite hardcoded git-command router.

## Follow-Up
1. Evaluate Sandbox `gitCheckout()` and backup/restore in a dedicated performance/bootstrap milestone after plan-116 stabilization.
2. Track Artifacts/ArtifactFS as a separate infra decision once warm-start optimization is prioritized.
