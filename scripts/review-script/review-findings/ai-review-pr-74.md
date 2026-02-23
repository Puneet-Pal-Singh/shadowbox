# AI Review Findings

- Generated: 2026-02-23 11:59:03 UTC
- Repo: Puneet-Pal-Singh/shadowbox
- PR: #74
- Bots: coderabbitai,greptile-apps,codex
- Findings: 5
- Body mode: compact (1200 chars max per comment)
- Included: line comments only

## 1. [greptile-apps[bot]] apps/brain/src/services/byok/repository.ts:123

- Source: pull_review_comment
- Created: 2026-02-23T11:58:26Z
- URL: https://github.com/Puneet-Pal-Singh/shadowbox/pull/74#discussion_r2840482080

```markdown
`any` type violates AGENTS.md strict type safety rule. Extract row type to interface or use proper typing.

```suggestion
    const row = await stmt.first<{
      credential_id: string;
      user_id: string;
      workspace_id: string;
      provider_id: string;
      label: string;
      key_fingerprint: string;
      encrypted_secret_json: string;
      key_version: string;
      status: string;
      last_validated_at: string | null;
      last_error_code?: string;
      last_error_message?: string;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
    }>();
```

**Context Used:** Context from `dashboard` - AGENTS.md ([source](https://app.greptile.com/review/custom-context?memory=a78739d2-031d-460a-a982-808cd7fb7f34))

<sub>Note: If this suggestion doesn't match your team's coding style, reply to this and let me know. I'll remember it for next time!</sub>
```

## 2. [greptile-apps[bot]] apps/brain/src/services/byok/repository.ts:167

- Source: pull_review_comment
- Created: 2026-02-23T11:58:27Z
- URL: https://github.com/Puneet-Pal-Singh/shadowbox/pull/74#discussion_r2840482141

```markdown
`any` type violates AGENTS.md strict type safety rule. Define a proper row type.

```suggestion
    const rows = await stmt.all<{
      credential_id: string;
      user_id: string;
      workspace_id: string;
      provider_id: string;
      label: string;
      key_fingerprint: string;
      status: string;
      last_validated_at: string | null;
      last_error_code?: string;
      last_error_message?: string;
      created_at: string;
      updated_at: string;
    }>();
```

**Context Used:** Context from `dashboard` - AGENTS.md ([source](https://app.greptile.com/review/custom-context?memory=a78739d2-031d-460a-a982-808cd7fb7f34))
```

## 3. [greptile-apps[bot]] apps/brain/src/services/byok/repository.ts:247

- Source: pull_review_comment
- Created: 2026-02-23T11:58:28Z
- URL: https://github.com/Puneet-Pal-Singh/shadowbox/pull/74#discussion_r2840482187

```markdown
`any` type violates AGENTS.md strict type safety rule.

```suggestion
  private toDTO(row: {
    credential_id: string;
    user_id: string;
    workspace_id: string;
    provider_id: string;
    label: string;
    key_fingerprint: string;
    status: string;
    last_validated_at: string | null;
    last_error_code?: string;
    last_error_message?: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }): BYOKCredentialDTO {
```

**Context Used:** Context from `dashboard` - AGENTS.md ([source](https://app.greptile.com/review/custom-context?memory=a78739d2-031d-460a-a982-808cd7fb7f34))

<sub>Note: If this suggestion doesn't match your team's coding style, reply to this and let me know. I'll remember it for next time!</sub>
```

## 4. [greptile-apps[bot]] apps/brain/src/services/byok/repository.ts:141

- Source: pull_review_comment
- Created: 2026-02-23T11:58:29Z
- URL: https://github.com/Puneet-Pal-Singh/shadowbox/pull/74#discussion_r2840482242

```markdown
The `plaintext` field is not part of `BYOKCredential` schema. Adding ad-hoc properties breaks type contracts. Consider creating a separate return type like `BYOKCredentialWithPlaintext` or return a tuple `{ credential, plaintext }` for clarity.
```

## 5. [greptile-apps[bot]] apps/brain/src/services/byok/schema.ts:22

- Source: pull_review_comment
- Created: 2026-02-23T11:58:30Z
- URL: https://github.com/Puneet-Pal-Singh/shadowbox/pull/74#discussion_r2840482307

```markdown
Missing `created_by` column from schema but it's defined in `BYOKCredentialSchema`. This will cause mismatches when using the shared type.
```

