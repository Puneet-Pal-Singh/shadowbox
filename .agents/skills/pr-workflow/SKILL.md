---
name: pr-workflow
description: Create, review, and merge Pull Requests following Shadowbox quality standards. Use when the user wants to create a PR, review an existing PR, merge changes, or needs guidance on PR workflows and quality standards.
license: MIT
metadata:
  author: Shadowbox Team
  version: "1.0"
---

# PR Workflow Skill

Create, review, and merge Pull Requests following Shadowbox quality standards.

## When to Use This Skill

Use this skill when:

- User wants to create a Pull Request
- User asks to review a PR
- User wants to merge changes
- Preparing code for submission
- Checking PR quality and readiness

## PR Philosophy

> **"Skills execute workflow, maintainers provide judgment."**

Treat PRs as **reports first, code second**.

Always pause between steps to evaluate technical direction, not just command success.

## PR Quality Bar

Before any PR operation, ensure:

- Do not trust PR code by default
- Do not merge changes you cannot validate with a reproducible problem and tested fix
- Keep types strict - do not use `any` in implementation code
- Keep external-input boundaries typed and validated
- Keep implementations properly scoped - fix root causes, not local symptoms
- Identify and reuse canonical sources of truth
- Harden changes - evaluate security impact and abuse paths
- Understand the system before changing it
- Never make the codebase messier just to clear a PR queue

## Three-Phase Workflow

PRs follow a strict three-phase workflow:

1. **Review** → Understand and evaluate
2. **Prepare** → Fix and improve
3. **Merge** → Integrate cleanly

Maintain judgment between steps - they are necessary but not sufficient.

---

## Phase 1: Review PR

### Initial Assessment

```bash
# 1. Check out the PR locally
git fetch origin pull/<PR_NUMBER>/head:pr-<PR_NUMBER>
git checkout pr-<PR_NUMBER>

# 2. Understand the context
gh pr view <PR_NUMBER> --json title,body,author,commits

# 3. Review commit history
git log --oneline main..HEAD

# 4. Check what files changed
git diff --stat main...HEAD
```

### Code Review Checklist

**For each file changed, verify:**

#### Logic & Correctness

- [ ] Code solves the stated problem
- [ ] Edge cases handled
- [ ] Error paths tested
- [ ] No obvious bugs or logic errors

#### Code Quality

- [ ] Follows SOLID principles
- [ ] No "God objects" (functions < 50 lines)
- [ ] Proper error handling
- [ ] No `any` types
- [ ] Clear variable/function names

#### Security

- [ ] Input validated
- [ ] No injection vulnerabilities
- [ ] No secrets exposed
- [ ] Authorization checks present

#### Testing

- [ ] Tests included for new logic
- [ ] Tests pass locally
- [ ] Edge cases covered

#### Documentation

- [ ] Code comments where needed
- [ ] README updated if relevant
- [ ] API docs updated if relevant

### Review Feedback

Provide structured feedback:

```markdown
## PR Review: <Title>

### Summary

Brief assessment of the PR's goal and approach.

### Critical Issues (must fix)

- Issue 1 with explanation
- Issue 2 with explanation

### Suggestions (optional)

- Improvement 1
- Improvement 2

### Testing

- [ ] I tested this locally
- [ ] Tests pass
- [ ] Edge cases verified

### Verdict

- [ ] Approve - Ready to merge
- [ ] Request Changes - Needs work
- [ ] Comment - Needs discussion
```

---

## Phase 2: Prepare PR

### Before Creating a PR

```bash
# 1. Ensure you're on the right branch
git branch -v

# 2. Check the diff
git diff main...HEAD

# 3. Verify tests pass
npm test
npm run typecheck
npm run lint

# 4. Update with latest main
git fetch origin
git rebase origin/main
# OR if you prefer merge:
# git merge origin/main
```

### Commit Quality

**Good commits tell a story:**

```bash
# Check current commits
git log --oneline main..HEAD

# If messy, reorganize with interactive rebase
git rebase -i main

# Follow conventional commits:
# feat: add user authentication
# fix: resolve race condition in cache
# refactor: simplify error handling
# docs: update API examples
# test: add integration tests
```

### Create PR

```bash
# Push branch to remote
git push -u origin <branch-name>

# Create PR with gh CLI
gh pr create \
  --title "feat: descriptive title" \
  --body "$(cat <<'EOF'
## Summary
Brief description of changes

## Changes
- Change 1
- Change 2

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guide
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
EOF
)"
```

### PR Body Template

```markdown
## Summary

One-paragraph explanation of the change.

## Motivation

Why is this change needed? What problem does it solve?

## Changes

- Specific change 1
- Specific change 2
- Specific change 3

## Testing

Describe how you tested these changes:

- Unit tests: `npm test -- src/feature.test.ts`
- Integration tests: `npm run test:integration`
- Manual testing steps

## Screenshots (if UI changes)

[Include relevant screenshots]

## Breaking Changes

List any breaking changes and migration steps.

## Related Issues

Fixes #123
Relates to #456

## Checklist

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding documentation changes
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective
- [ ] New and existing unit tests pass locally
- [ ] Any dependent changes have been merged and published
```

---

## Phase 3: Merge PR

### Pre-Merge Verification

```bash
# 1. Get latest from main
git checkout main
git pull --rebase origin main

# 2. Switch to PR branch
git checkout <branch-name>

# 3. Rebase onto latest main
git rebase main

# 4. Run full test suite
npm ci
npm run build
npm test
npm run typecheck
npm run lint

# 5. Force push if rebased
git push --force-with-lease
```

### Merge Strategy

**Prefer rebase** when commits are clean and tell a clear story:

```bash
# Rebase merge (clean history)
gh pr merge <PR_NUMBER> --rebase --admin
```

**Squash** when history is messy or commits don't stand alone:

```bash
# Squash merge (single commit)
gh pr merge <PR_NUMBER> --squash --admin
```

**Always add PR author as co-contributor**:

```bash
# When squashing, preserve authorship
git commit --amend --author="Original Author <email@example.com>"
```

### Post-Merge

```bash
# 1. Verify merge succeeded
git checkout main
git log --oneline -5

# 2. Verify tests on main
npm test

# 3. Delete branch locally and remotely
git branch -d <branch-name>
git push origin --delete <branch-name>

# 4. Leave PR comment explaining merge
gh pr comment <PR_NUMBER> --body "Merged via rebase/squash. SHA: <commit-hash>"
```

---

## Multi-Agent PR Safety

When multiple agents work on PRs:

### Do NOT

- Switch branches unless explicitly requested
- Create/apply/drop git stash unless explicitly requested
- Modify git worktree checkouts unless explicitly requested
- Force push without `--force-with-lease`

### DO

- Scope commits to your changes only
- Pull with rebase to integrate latest changes: `git pull --rebase`
- Alert user if local changes or unpushed commits exist before reviewing
- Focus reports on your edits

### Conflict Resolution

If conflicts arise:

```bash
# 1. Identify conflicting files
git status

# 2. View conflicts
git diff --name-only --diff-filter=U

# 3. Resolve each file manually
# Edit files to resolve conflicts

# 4. Mark as resolved
git add <resolved-files>

# 5. Continue rebase
git rebase --continue

# 6. If stuck, abort and try merge instead
git rebase --abort
git merge main
```

---

## PR Commands Reference

### GitHub CLI (gh)

```bash
# View PR details
gh pr view <number>
gh pr view <number> --json title,body,author,commits

# Check out PR
git fetch origin pull/<number>/head:pr-<number>
git checkout pr-<number>

# Create PR
git push -u origin <branch>
gh pr create --title "..." --body "..."

# List PRs
gh pr list
gh pr list --author @me
gh pr list --state open

# Review PR
gh pr review <number> --approve --body "LGTM!"
gh pr review <number> --request-changes --body "Needs work..."

# Merge PR
gh pr merge <number> --rebase
gh pr merge <number> --squash
gh pr merge <number> --merge

# Comment on PR
gh pr comment <number> --body "Comment text"

# Close PR
gh pr close <number>
gh pr close <number> --delete-branch
```

### Git Commands

```bash
# Compare branches
git diff main...feature-branch
git diff --stat main...feature-branch

# Review commit history
git log --oneline main..feature-branch
git log --graph --oneline --all

# Review changes per commit
git log -p main..feature-branch

# Check which files changed
git diff --name-only main...feature-branch

# Show PR branch info
git branch -vv
```

---

## Common PR Scenarios

### Scenario 1: PR Has Merge Conflicts

```bash
# 1. Fetch latest
git fetch origin

# 2. Rebase onto main
git rebase origin/main

# 3. Resolve conflicts (edit files)

# 4. Continue rebase
git add .
git rebase --continue

# 5. Force push
git push --force-with-lease
```

### Scenario 2: PR Needs Updates After Review

```bash
# 1. Make requested changes
# Edit files...

# 2. Stage changes
git add -A

# 3. Commit with amend if small fix
git commit --amend --no-edit

# 4. Or new commit for larger changes
git commit -m "fix: address review feedback"

# 5. Push
git push --force-with-lease  # if amended
git push  # if new commit
```

### Scenario 3: Split Large PR

```bash
# 1. Create new branch from main
git checkout main
git checkout -b feat/part-1

# 2. Cherry-pick relevant commits
git cherry-pick <commit-1>
git cherry-pick <commit-2>

# 3. Push and create PR
git push -u origin feat/part-1
gh pr create

# 4. Repeat for other parts
```

---

## Integration with AGENTS.md

This skill implements:

- Section 2 (DevOps/Git Operator role)
- Section 9 (Git & Workflow Protocol)
- Section 12 (Multi-Agent Safety Rules)
- Section 13 (Testing Guidelines)

Reference AGENTS.md for complete workflow specifications and constraints.
