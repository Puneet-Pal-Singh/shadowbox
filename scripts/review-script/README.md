# AI Review Script

Automated GitHub PR review comment aggregation and formatting tool.

This script fetches all code review comments from AI bots (CodeRabbit, Greptile, etc.) on a GitHub PR, aggregates them, and renders them into a structured Markdown report.

## Purpose

- **Centralized review findings**: Collect all AI bot code review comments in one place
- **Structured output**: Format findings in clean, actionable Markdown
- **Polling support**: Wait for AI bots to complete their analysis before fetching
- **Bot filtering**: Include/exclude specific bot commenters
- **Compact mode**: Truncate verbose comment bodies for readability

## Prerequisites

- **GitHub CLI** (`gh`): Authentication required
  ```bash
  gh auth login
  ```
- **jq**: JSON query tool
- **bash 4.0+**

## Installation

The script is included in the repo at `scripts/review-script/fetch-review-comments.sh`.

Add the npm script to your `package.json` (already configured):

```json
{
  "scripts": {
    "review:sync": "bash scripts/review-script/fetch-review-comments.sh"
  }
}
```

## Usage

### Basic Usage (Auto-detect)

```bash
# Auto-detect current repo and PR, fetch all bot reviews
pnpm review:sync

# Or directly:
bash scripts/review-script/fetch-review-comments.sh
```

**Output**: `scripts/review-script/ai-review-pr-<number>.md`

### Wait for Reviews (Polling)

```bash
# Wait up to 8 minutes for bot reviews to complete
pnpm review:sync --wait-minutes 8 --poll-seconds 20

# Stop waiting once you have at least 5 comments
pnpm review:sync --wait-minutes 10 --min-comments 5
```

### Custom Repository & PR

```bash
bash scripts/review-script/fetch-review-comments.sh \
  --repo owner/repo \
  --pr 43 \
  --output my-review.md
```

### Filter Specific Bots

```bash
# Only CodeRabbit comments
bash scripts/review-script/fetch-review-comments.sh --bots coderabbitai

# Multiple bots
bash scripts/review-script/fetch-review-comments.sh --bots "coderabbitai,greptile-apps"

# All comments (any author)
bash scripts/review-script/fetch-review-comments.sh --bots all
```

### Include General PR Comments

```bash
# Include line comments + general PR issue comments
bash scripts/review-script/fetch-review-comments.sh --include-issue-comments
```

### Full-Body Comments

```bash
# Disable truncation, keep full comment text
bash scripts/review-script/fetch-review-comments.sh --full-body

# Increase truncation limit to 2000 chars
bash scripts/review-script/fetch-review-comments.sh --max-body-chars 2000
```

## Options

```
--repo <owner/repo>        GitHub repository (auto-detect if omitted)
--pr <number>              Pull request number (auto-detect if omitted)
--output <path>            Output Markdown file (default: scripts/review-script/ai-review-pr-<pr>.md)
--bots <csv>               Bot logins to include (default: coderabbitai,greptile-apps; use 'all' for all authors)
--wait-minutes <number>    Wait/poll for new comments before exiting (default: 0)
--poll-seconds <number>    Poll interval when waiting (default: 20)
--min-comments <number>    Stop waiting when this many matching comments are found (default: 1)
--include-issue-comments   Include general PR issue comments (default: off)
--no-issue-comments        Force line-level PR review comments only
--max-body-chars <number>  Max characters per comment body (default: 1200)
--full-body                Disable compact truncation and keep full body
--help, -h                 Show help message
```

## Examples

### PR #43 - Wait for CodeRabbit, then fetch

```bash
bash scripts/review-script/fetch-review-comments.sh \
  --pr 43 \
  --wait-minutes 6 \
  --poll-seconds 15
```

**Output**: `scripts/review-script/ai-review-pr-43.md`

### Generate review report for team review

```bash
bash scripts/review-script/fetch-review-comments.sh \
  --repo Puneet-Pal-Singh/shadowbox \
  --pr 43 \
  --include-issue-comments \
  --output team-review.md
```

### Fetch all comments with full text

```bash
bash scripts/review-script/fetch-review-comments.sh \
  --pr 43 \
  --full-body \
  --max-body-chars 10000
```

## Output Format

```markdown
# AI Review Findings

- Generated: 2026-02-17 14:49:20 UTC
- Repo: Puneet-Pal-Singh/shadowbox
- PR: #43
- Bots: coderabbitai,greptile-apps
- Findings: 22
- Body mode: compact (1200 chars max per comment)
- Included: line comments only

## 1. [coderabbitai] apps/web/src/services/SessionStateService.ts:242

- Source: pull_review_comment
- Created: 2026-02-17T12:36:06Z
- URL: https://github.com/Puneet-Pal-Singh/shadowbox/pull/43#discussion_r2816824945

\`\`\`markdown
weak random ID generation - Math.random() is not cryptographically secure
...
\`\`\`

## 2. [greptile-apps[bot]] apps/web/src/hooks/useSessionManager.ts:41

- Source: pull_review_comment
- Created: 2026-02-17T12:36:07Z
- URL: https://github.com/Puneet-Pal-Singh/shadowbox/pull/43#discussion_r2816825015

\`\`\`markdown
potential infinite re-render loop
...
\`\`\`
```

## Workflow Integration

### Step 1: Create PR

```bash
git push origin feat/your-feature
gh pr create --title "feat: your feature"
```

### Step 2: Wait for AI reviews (optional)

```bash
# Fetch after giving bots 5-10 minutes to analyze
pnpm review:sync --wait-minutes 8
```

### Step 3: Review findings

Open `scripts/review-script/ai-review-pr-<number>.md`

### Step 4: Address issues

Fix critical findings and push:

```bash
git add <fixed-files>
git commit -m "fix: address code review findings"
git push
```

### Step 5: Re-run review (if needed)

```bash
rm scripts/review-script/ai-review-pr-<number>.md  # Remove old report
pnpm review:sync  # Fetch fresh review data
```

## Features

✅ **Auto-detection**: Detects repo and PR number from git context  
✅ **Polling**: Wait for bots to complete analysis  
✅ **Multi-bot**: Support CodeRabbit, Greptile, and custom bots  
✅ **Filtering**: Include/exclude specific comment types  
✅ **Compact mode**: Truncate verbose comments for readability  
✅ **Pagination**: Automatically handles 100+ comments via GitHub API  
✅ **Error handling**: Clear error messages and validation  

## Troubleshooting

### "GitHub CLI is not authenticated"

```bash
gh auth login
# Select: GitHub.com
# Select: HTTPS
# Authenticate with web browser
```

### "Could not auto-detect repository"

Pass explicit repo:

```bash
bash scripts/review-script/fetch-review-comments.sh --repo owner/repo --pr 43
```

### "Could not auto-detect pull request number"

Pass explicit PR:

```bash
bash scripts/review-script/fetch-review-comments.sh --pr 43
```

### "No matching bot comments found"

Check if bots have posted reviews:

```bash
# List all comment authors
gh pr view 43 --json comments

# Fetch all comments (any bot)
bash scripts/review-script/fetch-review-comments.sh --bots all
```

### Script timing out

Increase wait time or reduce polling interval:

```bash
bash scripts/review-script/fetch-review-comments.sh \
  --wait-minutes 15 \
  --poll-seconds 30
```

## Implementation Notes

- **API**: Uses GitHub REST API via `gh` CLI (authenticated)
- **Pagination**: Automatically fetches all 100+ comments via `--paginate`
- **Normalization**: Converts different comment formats to unified structure
- **Sorting**: Comments sorted by creation time
- **De-duplication**: Filters by bot login (case-insensitive)
- **Error handling**: Validates all numeric arguments, checks command availability

## Recent Improvements (M1.3)

This script was used to aggregate AI code review findings for PR #43 (M1.3 - Single Agent Multi-Session Isolation):

- Identified 22 distinct code review findings
- Categorized by severity: Critical, Major, Minor
- Grouped by file and line number
- Truncated to 1200 chars per comment for readability
- Enabled quick identification and fix of security/correctness issues

**Result**: 8 critical issues fixed in follow-up commit, improving:
- Session ID generation security
- Race condition prevention
- Data validation correctness
- Code quality and performance

## License

MIT (same as Shadowbox project)
