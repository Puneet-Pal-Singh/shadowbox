# Protocol Versioning and Compatibility Policy (v1)

## Scope

This policy governs the external protocol contracts in `@repo/shared-types`:

- Chat response protocol (`CHAT_RESPONSE_PROTOCOL_VERSION`)
- External contract freeze manifest (`EXTERNAL_CONTRACT_FREEZE_VERSION`)

Current policy baseline:

- Policy version: `v1`
- Current protocol version: `1`
- Minimum compatible version: `1`
- Breaking-change deprecation window: `90` days

## Change Categories

### Non-breaking (`non_breaking`)

Examples:

- Additive fields marked optional
- Clarifying docs and comments
- Validation hardening that does not change accepted/required contract shape

Rules:

- Protocol version must not change
- Existing consumers remain compatible without migration

### Breaking (`breaking`)

Examples:

- Removing or renaming required fields
- Changing event enum values used by clients
- Tightening validation that invalidates previously valid payloads

Rules:

- Protocol version must increment by exactly `+1`
- Change must include a policy reference in this document
- Deprecation and migration communication window is required (`90` days)

## Compatibility Window

- Services and clients are expected to interoperate within
  `[minimum-compatible, current]`.
- For v1 policy, that is `[1, 1]`.
- Any proposed version `> current` is considered incompatible until current is
  advanced by policy-governed release.

## Breaking Change Process

1. Classify the change as `breaking`.
2. Prepare migration notes for consumer teams before merge.
3. Bump protocol version by exactly one.
4. Reference this policy anchor in the change record:
   `packages/shared-types/PROTOCOL_VERSIONING_POLICY.md#breaking-change-process`
5. Keep deprecation window and rollout expectations explicit in the PR and release notes.

## PR Checklist Reference

For contract-changing PRs, include one of:

- `packages/shared-types/PROTOCOL_VERSIONING_POLICY.md#change-categories`
- `packages/shared-types/PROTOCOL_VERSIONING_POLICY.md#breaking-change-process`
- `packages/shared-types/PROTOCOL_VERSIONING_POLICY.md#compatibility-window`
