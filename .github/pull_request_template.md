<!--
Shadowbox Pull Request Template

Title guidelines:
- Required: <type>(<scope>): <imperative summary>
  Example: fix(runtime): enforce runId isolation in harness adapter
- Type choice quick guide (for conventional titles):
  - feat: new behavior/capability visible to users or integrators
  - fix: bug or regression correction in existing behavior
  - refactor: internal structural change with no behavior change
- Use the type in the PR title only (do not put this in PR body headings).
- Avoid internal IDs and phase labels in title (SHA-*, plan numbers, etc.)
-->

## Summary
<!-- 2-5 bullets: what changed, where, and impact -->
- 

## What was accomplished
<!-- Outcome-first bullets: what is now true after this PR -->
- 
- 
- 

## Why this change
<!-- Problem statement and user/engineering impact -->

## Scope
- In scope:
- Out of scope:

## Linked issues
Closes #
Related #

## Changes
- 
- 
- 

## Risk & rollout
- Risk level: Low | Medium | High
- Rollout plan:
- Rollback plan:

## Validation
- [ ] Relevant tests added/updated for behavior changes
- [ ] Type-check and lint pass
- [ ] Docs updated if behavior changed

### Commands run
```bash
# Example:
pnpm --filter <pkg> type-check
pnpm --filter <pkg> test -- <target>
pnpm lint
```

### Manual verification
1. 
2. 
3. 

## Breaking changes
- [ ] None
- [ ] Yes (describe migration)

## Reviewer focus
<!-- Highest-risk modules/contracts to check first -->
- 

## Follow-ups (optional)
<!-- Separate tasks intentionally deferred -->
- 
