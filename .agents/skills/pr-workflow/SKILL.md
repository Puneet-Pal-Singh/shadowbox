---
name: pr-workflow
description: Create, review, and merge Pull Requests following Shadowbox quality standards. Use when the user wants to create a PR, review an existing PR, merge changes, or needs guidance on PR workflows and quality standards.
license: MIT
metadata:
  author: Shadowbox Team
  version: "1.2"
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

## Repository Overrides (Shadowbox)

When this skill is used in the Shadowbox repo, these rules are mandatory:

- Follow `AGENTS.md` as the source of truth when instructions conflict.
- Use atomic commits and stage files with explicit paths only.
- Never use `git add -A` or `git add .`.
- Prefer non-interactive git flows in automated sessions.
- Use the required PR description structure from `AGENTS.md` Section 18.
- On shared/reviewed branches, sync with `git pull --ff-only` by default.
- Rebase is allowed only on private in-progress branches before first PR.
- Follow `local/Rules/GIT-RULES.md` as mandatory workflow policy.
- Follow `local/Rules/pr-strategy-checklist.md` for PR split/merge order.
- **CRITICAL**: Never create task completion reports, summaries, or documentation files unless explicitly requested by user.
  - ❌ Do NOT create `PR-4-COMPLETION-REPORT.md`, `SUMMARY.md`, `SESSION_SUMMARY.md` (by default), or auto-generated docs
  - ✅ DO put all details in PR description itself
  - See `AGENTS.md` Section 18 "Documentation Files: STRICT RULE"

## Conflict Prevention Gate (MANDATORY)

Before push or merge actions, run:

```bash
git fetch origin
git status -sb
if git rev-parse --abbrev-ref --symbolic-full-name @{upstream} >/dev/null 2>&1; then
  git rev-list --left-right --count @{upstream}...HEAD
else
  echo "No upstream tracking branch yet; skipping divergence count."
fi
git diff --name-only origin/main...HEAD
```

Rules:

- If branch is shared/reviewed: integrate with `git pull --ff-only` or explicit merge from `origin/main`.
- If `--ff-only` fails: stop and do explicit merge conflict resolution.
- Rebase only on private pre-PR branches.
- Create/switch branches only on explicit user request or explicit workflow step.
- Keep PRs small and boundary-scoped to reduce overlap conflicts.
- Never use blanket conflict strategies (`-X ours`/`-X theirs`) for runtime/business logic.

## PR Train Mode (Preferred for 3+ related PRs)

Use PR train when a milestone has multiple tightly-related PRs:

1. Create train branch: `codex/train-<milestone>`.
2. Open checkpoint PRs to train branch.
3. Keep checkpoint branches non-overlapping by ownership.
4. Merge one final train -> `main` PR after train checks are green.

Do not:

1. merge sibling checkpoint branches into each other,
2. retarget checkpoint PRs repeatedly between siblings and main.

## Naming Standards (Shadowbox)

Use semantic, intent-first naming for both branches and PR titles.

- Branch names must describe the technical change, not internal sequencing.
- PR titles must follow conventional commits and describe behavior or architecture impact.
- Do not use numbering/phase labels in branch names or PR titles:
  - `pr-1`, `pr-2`, `phase-1`, `phase-2`, `task-3`, etc.
- Internal tracking IDs are allowed only in PR body metadata (for example: `Internal Ref: JIRA-123` or `GitHub Issue: #42`).
- Canonical branch prefixes: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`, `test/`.

Recommended branch format:

```bash
<type>/<intent>
```

Optional automated-agent prefix (only if required by the execution platform):

```bash
codex/<type>-<intent>
```

Examples:

```bash
feat/session-auth-hardening
fix/cloud-executor-error-redaction
refactor/import-boundary-guardrails
test/provider-strict-mode-contract
```

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

## Four-Phase Workflow

PRs follow a strict four-phase workflow:

1. **Review** → Understand and evaluate
2. **Prepare** → Fix and improve
3. **Auto-Review Loop** → Run AI checks, fix findings, iterate until clean
4. **Merge** → Integrate cleanly

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
git checkout main
git pull --ff-only origin main
git checkout <branch-name>
# Shared/reviewed branch:
git merge origin/main
# Private pre-PR branch only:
# git rebase origin/main
```

### Commit Quality

**Good commits tell a story:**

```bash
# Check current commits
git log --oneline main..HEAD

# If commit history is messy, prefer non-interactive cleanup:
# - create focused fixup commits
# - optionally squash with explicit commit hashes
# git rebase --onto <newbase> <upstream> <branch>  # advanced, optional

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

# Create PR with gh CLI (use repo template body file)
PR_TITLE="fix(runtime): enforce runId isolation in harness adapter"
cp .github/pull_request_template.md /tmp/pr-body.md
${EDITOR:-vi} /tmp/pr-body.md

gh pr create \
  --base main \
  --head <branch-name> \
  --title "$PR_TITLE" \
  --body-file /tmp/pr-body.md
```

### PR Title Rules (Required)

Use conventional-commit type in title:

```bash
# Required:
<type>(<scope>): <imperative summary>

# Good:
fix(runtime): enforce runId isolation in harness adapter
feat(web): add composer model picker popover
refactor(brain): extract run lifecycle collaborators

# Avoid:
runtime: enforce runId isolation
fix: misc changes
update PR
```

Type selection guide:

- `feat`: adds new externally visible behavior/capability.
- `fix`: corrects incorrect behavior, bug, or regression.
- `refactor`: internal structure change only, no behavior/contract change.
- If PR mixes refactor + behavior change, choose `feat` or `fix` by user-visible outcome.

### PR Body Template (Required)

Check the -> PR body template in `.github/pull_request_template.md` and ensure all sections are filled out with relevant information. Do not leave any section blank.

### PR Content Safety (Mandatory)

- Never include internal references in PR body (`SHA-*`, internal plan IDs, internal Linear-only IDs).
- Never include internal/local file paths or filenames from ignored/private files (for example content under `plans/`, `local/`, or any `.gitignore`d path).
- Do not add a `References` section containing private planning links.
- `## Related` is only for public GitHub links:
  - Related PRs: `https://github.com/<org>/<repo>/pull/<n>`
  - Public issues: `https://github.com/<org>/<repo>/issues/<n>`
  - If none, write `N/A`.

---

## Phase 3: Automated AI Review Loop

After pushing changes, fetch AI review findings and iterate with explicit judgment.

### Auto-Review Workflow

Run this after each push (manually or in automation):

```bash
# 1. Push changes to remote
git push origin <branch-name>

# 2. Fetch latest AI review comments
bash scripts/review-script/fetch-review-comments.sh \
  --wait-minutes 5 \
  --min-comments 1

# 3. Open newest review findings file
latest_file="$(ls -t scripts/review-script/review-findings/ai-review-pr-*.md 2>/dev/null | head -n 1 || true)"
if [[ -z "$latest_file" || ! -f "$latest_file" ]]; then
  echo "ERROR: No review findings file generated"
  exit 1
fi
cat "$latest_file"
```

### Review-Fix-Push Loop

**Iterate until findings are triaged and no new signal appears:**

1. **Fetch AI review findings**
   - Run: `bash scripts/review-script/fetch-review-comments.sh --wait-minutes 2`
   - Use the newest generated `ai-review-pr-*.md` file.

2. **Count findings from latest file**
   - Count headings with `^## <n>.` as finding entries.
   - If finding count is `0` → proceed to Phase 4 (Merge).

3. **Triage each finding**
   - Label each as: `valid-fix`, `not-applicable`, or `defer`.
   - Fix only `valid-fix` findings after verifying against current code.

4. **Commit only intended fixes**
   - Stage explicit files only: `git add path/to/file1 path/to/file2`
   - Commit with conventional message, e.g.:
   ```bash
   git commit -m "fix: address AI review findings"
   ```

5. **Push and repeat**
   - Push: `git push origin <branch-name>`
   - Re-run fetch script and compare latest findings to previous iteration.
   - If findings are unchanged for 2 consecutive attempts, stop and request manual review.

### Example Loop

```bash
#!/bin/bash
set -euo pipefail

ATTEMPTS=0
MAX_ATTEMPTS=10
REPEAT_COUNT=0
PREV_SIG=""

while [[ $ATTEMPTS -lt $MAX_ATTEMPTS ]]; do
  echo "=== AI Review Attempt $((ATTEMPTS + 1)) ==="

  bash scripts/review-script/fetch-review-comments.sh --wait-minutes 2

  latest_file="$(ls -t scripts/review-script/review-findings/ai-review-pr-*.md 2>/dev/null | head -n 1 || true)"
  if [[ -z "$latest_file" || ! -f "$latest_file" ]]; then
    echo "ERROR: No review file found"
    exit 1
  fi

  finding_count="$(awk '/^## [0-9]+\\./{c++} END{print c+0}' "$latest_file")"
  sig="$(awk '/^## [0-9]+\\./{print}' "$latest_file" | shasum -a 256 | awk '{print $1}')"

  if [[ "$finding_count" -eq 0 ]]; then
    echo "✅ No findings in latest file. Ready for merge checks."
    exit 0
  fi

  if [[ "$sig" == "$PREV_SIG" ]]; then
    REPEAT_COUNT=$((REPEAT_COUNT + 1))
  else
    REPEAT_COUNT=0
  fi
  PREV_SIG="$sig"

  if [[ "$REPEAT_COUNT" -ge 2 ]]; then
    echo "⚠️ Findings unchanged across attempts. Manual review required."
    exit 1
  fi

  echo "Found $finding_count items. Apply verified fixes, then commit/push."
  cat "$latest_file"

  # Apply fixes...
  # git add path/to/file1 path/to/file2
  # git commit -m "fix: address AI review findings"
  # git push origin HEAD

  ATTEMPTS=$((ATTEMPTS + 1))
done

echo "❌ Max attempts reached. Manual review needed."
exit 1
```

### When to Stop

Stop the auto-review loop when:

- **No findings in latest file**: finding count is `0`
- **Unchanged findings repeat**: same findings signature repeats 2 times
- **Max attempts reached**: after 10 iterations, request manual review
- **Critical issue**: stop immediately for security/data-loss findings

### Review File Location

Generated files follow this pattern:
- First run: `scripts/review-script/review-findings/ai-review-pr-69.md`
- Subsequent runs: `scripts/review-script/review-findings/ai-review-pr-69-2.md`, `-3.md`, etc.

Always check the **latest file** (most recent by timestamp) for current findings.

---

## Phase 4: Merge PR

### Pre-Merge Verification

```bash
# 1. Get latest from main
git checkout main
git pull --ff-only origin main

# 2. Switch to PR branch
git checkout <branch-name>

# 3. Integrate latest main
# Shared/reviewed branch:
git merge main
# Private pre-PR branch only:
# git rebase main

# 4. Run full test suite
npm ci
npm run build
npm test
npm run typecheck
npm run lint

# 5. Push safely
git push
# Only if private branch was rebased:
# git push --force-with-lease
```

### Merge Strategy

**Prefer merge commit or squash** for reviewed/shared branches:

```bash
# Merge commit (preserves traceability)
gh pr merge <PR_NUMBER> --merge --admin
```

**Squash** when history is messy or commits don't stand alone:

```bash
# Squash merge (single commit)
gh pr merge <PR_NUMBER> --squash --admin
```

**Use rebase merge only when explicitly requested**:

```bash
gh pr merge <PR_NUMBER> --rebase --admin
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
gh pr comment <PR_NUMBER> --body "Merged via merge/squash. SHA: <commit-hash>"
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
- Pull with fast-forward only on shared/reviewed branches: `git pull --ff-only`
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

# 5a. Continue merge (shared/reviewed branches)
git merge --continue

# 5b. Continue rebase (private pre-PR branches only)
# git rebase --continue

# 6. If stuck, abort and retry with explicit strategy
if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  git merge --abort
elif [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
  git rebase --abort
fi
# Then retry integration with explicit strategy:
# shared/reviewed branch: git merge main
# private pre-PR branch: git rebase main
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
git merge origin/main
# Private pre-PR branch only:
# git rebase origin/main

# 3. Resolve conflicts (edit files)

# 4. Continue merge/rebase (stage only intended files)
git add <resolved-file-1> <resolved-file-2>
git merge --continue
# or (private pre-PR only):
# git rebase --continue

# 5. Push
git push
# if rebased on private branch:
# git push --force-with-lease
```

### Scenario 2: PR Needs Updates After Review

```bash
# 1. Make requested changes
# Edit files...

# 2. Stage changes (explicit paths only)
git add path/to/file1 path/to/file2

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
- Section 18 (PR Documentation Standard)

Reference AGENTS.md for complete workflow specifications and constraints.

---

## Automated AI Review Integration

**Phase 3 (Auto-Review Loop) uses the external script:**
- `scripts/review-script/fetch-review-comments.sh` - Fetches AI bot comments from PR
- Fetches findings from: coderabbitai, greptile-apps, codex bots
- Automatically waits for reviews and generates markdown report
- Agent reads findings and applies fixes iteratively
- Loop repeats until findings are clear, unchanged, or max attempts reached

**When to invoke auto-review phase:**
- After pushing changes to a PR branch
- When user asks agent to "fix AI review findings"
- When user wants automated quality checks before merge
- In continuous review workflows where iterations are expected

**Agent will:**
1. Run fetch script after each push
2. Parse generated markdown file for findings
3. Read and understand each finding
4. Apply suggested fixes or implement own solution
5. Commit and push fixes
6. Repeat until clean or report issues
