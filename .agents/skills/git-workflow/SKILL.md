---
name: git-workflow
description: Execute safe git operations including branching, committing, and status checks. Use when the user needs to create branches, make commits, check git status, or perform basic git operations while following Shadowbox safety protocols.
license: MIT
metadata:
  author: Shadowbox Team
  version: "1.0"
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
- Switching branches (when explicitly requested)

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

4. **Multi-agent safety**:
   - Do NOT create/apply/drop `git stash` unless explicitly requested
   - Do NOT switch branches unless explicitly requested
   - Do NOT create/remove/modify `git worktree` checkouts unless explicitly requested
   - When user says "push", you may `git pull --rebase` to integrate latest changes
   - When user says "commit", scope to your changes only

## Branch Operations

### Create Feature Branch

```bash
# Check current status first
git status

# Pull latest from main
git checkout main
git pull --rebase origin main

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

### Safe Branch Switching

```bash
# Check for uncommitted changes
git status

# If clean, switch branch
git checkout branch-name

# If uncommitted changes exist, ask user:
# "You have uncommitted changes. Should I:
#   1. Stash them (git stash push -m 'WIP: description')
#   2. Commit them first
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
git pull --rebase origin main

# Create feature branch
git checkout -b feat/my-feature

# Do work...

# Commit when ready
git add .
git commit -m "feat: implement my feature"
```

### Wrap Up Work Session

```bash
# Check what needs committing
git status

# Stage and commit your changes
git add -A
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

If `git pull` or `git merge` fails:

```bash
# Check status
git status

# See conflicting files
git diff --name-only --diff-filter=U

# After manual resolution, mark as resolved
git add resolved-file.ts
git rebase --continue
# or
git merge --continue
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
