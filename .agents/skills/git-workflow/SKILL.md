---
name: git-workflow
description: Execute safe git operations including branching, committing, and status checks. Use when the user needs to create branches, make commits, check git status, or perform basic git operations while following Shadowbox safety protocols.
license: MIT
metadata:
  author: Shadowbox Team
  version: "1.2"
---

# Git Workflow Skill

Execute safe git operations with proper safety checks and Shadowbox protocols.

## When to Use This Skill

Use this skill when:

- Creating feature branches
- Making commits (single or grouped)
- Checking repository status
- Viewing commit history
- Staging changes
- Switching branches (only when explicitly requested)

## Safety Rules (CRITICAL)

1. **Never run destructive commands without explicit confirmation**:
   - `git reset --hard`
   - `git clean -fd`
   - `git push --force`
   - Branch deletion with unmerged changes

2. **Always check status before operations**:

   ```bash
   git status
   git branch -a
   git log --oneline -5
   ```

3. **Never switch branches if**:
   - There are uncommitted changes (unless explicitly told to stash)
   - The target branch is ambiguous
   - You're in the middle of a merge/rebase

4. **NEVER use `git add -A` or `git add .`**:
   - Always add specific files/paths explicitly
   - Ensures intentional, auditable commits
   - Pattern: `git add path/to/file` or `git add path/to/dir/`
   - ✅ `git add packages/planning-engine/src/types.ts` (specific file)
   - ✅ `git add packages/planning-engine/src/` (specific directory)
   - ❌ `git add -A` (too risky, unintentional files)
   - ❌ `git add .` (same risk as -A)

5. **Multi-agent safety**:
   - Do NOT create/apply/drop `git stash` unless explicitly requested
   - Do NOT switch branches unless explicitly requested
   - Do NOT create/remove/modify `git worktree` checkouts unless explicitly requested
   - On shared/reviewed branches, sync with `git pull --ff-only` (default)
   - Rebase is allowed only on private in-progress branches before first PR
   - When user says "commit", scope to your changes only

6. **Rule documents are mandatory**:
   - Follow `local/Rules/GIT-RULES.md`
   - Follow `local/Rules/pr-strategy-checklist.md`

## Conflict Prevention Protocol (MANDATORY)

Run this protocol before commit/push/PR:

1. **Fresh base check**:

   ```bash
   git fetch origin
   git status -sb
   if git rev-parse --abbrev-ref --symbolic-full-name @{upstream} >/dev/null 2>&1; then
     git rev-list --left-right --count @{upstream}...HEAD
   else
     echo "No upstream tracking branch yet; skipping divergence count."
   fi
   ```

2. **Divergence rule**:
   - If ahead/behind on a shared/reviewed branch, sync using `git pull --ff-only`.
   - If `--ff-only` fails, stop and use an explicit merge flow (do not auto-rebase shared history).

3. **Overlap risk check**:

   ```bash
   git diff --name-only origin/main...HEAD
   ```

   - If high-conflict files are shared across active PRs (runtime/core/router/policy), coordinate and sequence merges instead of parallel edits.

4. **PR size rule**:
   - Keep PR scope narrow (single boundary/topic).
   - Do not combine rename/moves with behavior changes in the same PR.

5. **No silent conflict resolution**:
   - Never use blanket `-X ours`/`-X theirs` for runtime/business logic files.
   - Resolve per file and re-run tests.

## PR Train Mode (for multi-PR milestones)

When a milestone has multiple tightly-coupled PRs, use train mode:

1. Create train branch: `codex/train-<milestone>`.
2. Create checkpoint branches from train branch.
3. Open checkpoint PRs to train branch only.
4. Open one final PR from train branch to `main`.

Hard rules:

1. Do not merge sibling checkpoint branches into each other.
2. Sync only from train branch or explicit `main` cut-point.

## Branch Operations

### Create Feature Branch (Explicit Request Required)

```bash
# Execute this flow only after explicit user request to create/switch branch.

# Check current status first
git status

# Pull latest from main
git checkout main
git pull --ff-only origin main

# Create and switch to feature branch
git checkout -b feat/descriptive-name

# Verify branch creation
git branch -v
```

**Naming conventions**:

- Features: `feat/feature-name`
- Fixes: `fix/bug-description`
- Refactoring: `refactor/description`
- Documentation: `docs/description`
- Chores: `chore/task-description`
- Tests: `test/test-scope`

### Safe Branch Switching

```bash
# Execute this flow only after explicit user request to switch branch.

# Check for uncommitted changes
git status

# If clean, switch branch
git checkout branch-name

# If uncommitted changes exist, ask user:
# "You have uncommitted changes. Should I:
#   1. Commit them first
#   2. Stash them (only if explicitly requested)
#   3. Cancel the switch"
```

## Commit Operations

### Atomic Commits

Make one logical change per commit:

```bash
# Stage specific files
git add src/specific/file.ts

# Or stage by pattern
git add src/services/

# Commit with conventional format
git commit -m "feat: add user authentication"
git commit -m "fix: resolve null pointer in cache"
git commit -m "refactor: extract validation logic"
git commit -m "docs: update API documentation"
```

**Conventional commit prefixes**:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `style:` - Formatting, no code change
- `refactor:` - Code restructuring
- `perf:` - Performance improvement
- `test:` - Adding tests
- `chore:` - Maintenance tasks

### Grouped Commits

When multiple related changes exist:

```bash
# Check what files changed
git status

# Stage logical groups separately
git add src/auth/
git commit -m "feat: implement JWT authentication"

git add tests/auth/
git commit -m "test: add auth service tests"

git add docs/auth.md
git commit -m "docs: document auth API"
```

## Status and History

### Check Repository State

```bash
# Current status
git status

# Short status
git status -sb

# Recent commits
git log --oneline -10

# Branch information
git branch -v

# Remote tracking
git branch -vv
```

### View Changes

```bash
# Staged changes
git diff --staged

# Unstaged changes
git diff

# Specific file
git diff src/file.ts

# Changes in last commit
git show HEAD
```

## Pre-Commit Checklist

Before every commit, verify:

1. **Scope**: Only your intended changes are staged

   ```bash
   git diff --staged --stat
   ```

2. **No secrets**: Check for accidental inclusion of:
   - API keys
   - Passwords
   - `.env` files
   - Private configuration

3. **Tests pass**: Run relevant tests

   ```bash
   npm test
   # or
   npm run test:related
   ```

4. **Lint clean**: Code follows style guidelines

   ```bash
   npm run lint
   # or
   npm run lint:fix
   ```

5. **Type check**: TypeScript compiles
   ```bash
   npm run typecheck
   ```

## Common Workflows

### Start New Feature

```bash
# Save current work
git status

# Update main
git checkout main
git pull --ff-only origin main

# Create feature branch
git checkout -b feat/my-feature

# Do work...

# Commit when ready (NEVER use git add -A)
git add src/services/MyService.ts
git commit -m "feat: implement my feature"
```

### Wrap Up Work Session

```bash
# Check what needs committing
git status

# Stage and commit your changes (by specific paths)
git add packages/my-package/src/
git commit -m "WIP: current progress on feature"

# Or if incomplete, note what's left:
git add src/
git commit -m "feat: partial implementation

TODO:
- Add error handling
- Write tests
- Update documentation"
```

## Error Handling

### Merge Conflicts

If `git pull --ff-only` or `git merge` fails:

```bash
# Check status
git status

# See conflicting files
git diff --name-only --diff-filter=U

# After manual resolution, mark as resolved
git add resolved-file.ts
git merge --continue
# If conflict happened during rebase on a private branch:
# git rebase --continue
```

### Failed Operations

Always check exit codes:

```bash
if ! git checkout main; then
    echo "Failed to checkout main. Current status:"
    git status
    exit 1
fi
```

## Integration with AGENTS.md

This skill implements the Git & Workflow Protocol from AGENTS.md:

- Section 9: Branching strategy and commit standards
- Section 12: Multi-agent safety rules
- Section 17: Common commands

Always reference AGENTS.md for the complete workflow specifications.
