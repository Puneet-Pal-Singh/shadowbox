#!/usr/bin/env bash

set -euo pipefail

SCRIPT_NAME="fetch-review-comments"
DEFAULT_OUTPUT_DIR="scripts/review-script/review-findings"
DEFAULT_OUTPUT_PREFIX="ai-review-pr"
DEFAULT_BOTS="coderabbitai,greptile-apps,codex"
DEFAULT_MAX_BODY_CHARS=1200

REPO=""
PR_NUMBER=""
OUTPUT_PATH=""
BOTS="$DEFAULT_BOTS"
WAIT_MINUTES=0
POLL_SECONDS=20
MIN_COMMENTS=1
INCLUDE_ISSUE_COMMENTS=0
COMPACT_MODE=1
MAX_BODY_CHARS="$DEFAULT_MAX_BODY_CHARS"

usage() {
  cat <<USAGE
Usage:
  scripts/review-script/fetch-review-comments.sh [options]

Options:
  --repo <owner/repo>        GitHub repository (auto-detect if omitted)
  --pr <number>              Pull request number (auto-detect if omitted)
  --output <path>            Output Markdown file (default: ${DEFAULT_OUTPUT_DIR}/${DEFAULT_OUTPUT_PREFIX}-<pr>.md)
  --bots <csv>               Bot logins to include (default: ${DEFAULT_BOTS}; partial match, use 'all' to include all authors)
  --wait-minutes <number>    Wait/poll for new comments before exiting (default: 0)
  --poll-seconds <number>    Poll interval when waiting (default: 20)
  --min-comments <number>    Stop waiting when this many matching comments are found (default: 1)
  --include-issue-comments   Include general PR issue comments (default: off)
  --no-issue-comments        Force line-level PR review comments only
  --max-body-chars <number>  Max characters per comment body (default: ${DEFAULT_MAX_BODY_CHARS})
  --full-body                Disable compact truncation and keep full body
  --help                     Show this help message

Examples:
  scripts/review-script/fetch-review-comments.sh
  scripts/review-script/fetch-review-comments.sh --pr 123 --wait-minutes 6 --poll-seconds 15
  scripts/review-script/fetch-review-comments.sh --repo owner/repo --pr 123 --output review.md
  scripts/review-script/fetch-review-comments.sh --wait-minutes 8 --include-issue-comments --max-body-chars 800
USAGE
}

log() {
  echo "[${SCRIPT_NAME}] $*"
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    log "Missing required command: $command_name"
    exit 1
  fi
}

is_number() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

resolve_output_path() {
  local pr_number="$1"
  local base_path="${DEFAULT_OUTPUT_DIR}/${DEFAULT_OUTPUT_PREFIX}-${pr_number}.md"
  local candidate="$base_path"
  local index=2

  if [[ ! -e "$candidate" ]]; then
    echo "$candidate"
    return
  fi

  while :; do
    candidate="${DEFAULT_OUTPUT_DIR}/${DEFAULT_OUTPUT_PREFIX}-${pr_number}-${index}.md"
    if [[ ! -e "$candidate" ]]; then
      echo "$candidate"
      return
    fi
    index=$((index + 1))
  done
}

fetch_endpoint_array() {
  local endpoint="$1"
  gh api "${endpoint}?per_page=100" --paginate | jq -s 'add // []'
}

normalize_review_comments() {
  jq 'map({
    source: "pull_review_comment",
    id,
    bot: (.user.login // "unknown"),
    path: (.path // null),
    line: (.line // .original_line // null),
    body: (.body // ""),
    url: (.html_url // ""),
    created_at: (.created_at // "")
  })'
}

normalize_issue_comments() {
  jq 'map({
    source: "pull_issue_comment",
    id,
    bot: (.user.login // "unknown"),
    path: null,
    line: null,
    body: (.body // ""),
    url: (.html_url // ""),
    created_at: (.created_at // "")
  })'
}

filter_allowed_bots() {
  local bots_csv="$1"
  jq --arg bots_csv "$bots_csv" '
    def normalize_login: ascii_downcase | gsub("\\[bot\\]$"; "") | gsub("^\\s+|\\s+$"; "");
    def is_allowed($bot; $allowed):
      any($allowed[]; . == "all" or . == "*" or $bot == . or ($bot | contains(.)));
    ($bots_csv | split(",") | map(normalize_login) | map(select(length > 0))) as $allowed
    | if any($allowed[]; . == "all" or . == "*") then
        sort_by(.created_at)
      else
        map(select((.bot | normalize_login) as $bot | is_allowed($bot; $allowed)))
        | sort_by(.created_at)
      end
  '
}

list_unique_authors() {
  local findings_json="$1"
  jq -r 'map(.bot) | unique | .[]' <<<"$findings_json"
}

format_comment_body() {
  local raw_body="$1"
  local formatted="$raw_body"

  if [[ "$COMPACT_MODE" -eq 1 ]]; then
    formatted="$(printf '%s\n' "$formatted" | sed '/<!--/,/-->/d')"

    if [[ "$MAX_BODY_CHARS" -gt 0 ]] && [[ "${#formatted}" -gt "$MAX_BODY_CHARS" ]]; then
      formatted="${formatted:0:$MAX_BODY_CHARS}"
      formatted="${formatted}"$'\n\n[truncated]'
    fi
  fi

  printf '%s' "$formatted"
}

render_markdown() {
  local output_path="$1"
  local repo="$2"
  local pr_number="$3"
  local bots_csv="$4"
  local findings_json="$5"

  local findings_count
  findings_count="$(jq 'length' <<<"$findings_json")"

  mkdir -p "$(dirname "$output_path")"

  {
    echo "# AI Review Findings"
    echo
    echo "- Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo "- Repo: ${repo}"
    echo "- PR: #${pr_number}"
    echo "- Bots: ${bots_csv}"
    echo "- Findings: ${findings_count}"
    if [[ "$COMPACT_MODE" -eq 1 ]]; then
      echo "- Body mode: compact (${MAX_BODY_CHARS} chars max per comment)"
    else
      echo "- Body mode: full"
    fi
    if [[ "$INCLUDE_ISSUE_COMMENTS" -eq 1 ]]; then
      echo "- Included: line comments + general PR comments"
    else
      echo "- Included: line comments only"
    fi
    echo

    if [[ "$findings_count" -eq 0 ]]; then
      echo "No matching bot comments found."
      return
    fi

    local index=1
    while IFS= read -r item; do
      local bot
      local source
      local path
      local line
      local created_at
      local url
      local body
      local location

      bot="$(jq -r '.bot' <<<"$item")"
      source="$(jq -r '.source' <<<"$item")"
      path="$(jq -r '.path // "general"' <<<"$item")"
      line="$(jq -r '.line // empty' <<<"$item")"
      created_at="$(jq -r '.created_at // ""' <<<"$item")"
      url="$(jq -r '.url // ""' <<<"$item")"
      body="$(jq -r '.body // ""' <<<"$item")"

      location="$path"
      if [[ -n "$line" ]]; then
        location="${path}:${line}"
      fi

      echo "## ${index}. [${bot}] ${location}"
      echo
      echo "- Source: ${source}"
      if [[ -n "$created_at" ]]; then
        echo "- Created: ${created_at}"
      fi
      if [[ -n "$url" ]]; then
        echo "- URL: ${url}"
      fi
      echo
      echo '```markdown'
      printf '%s\n' "$(format_comment_body "$body")"
      echo '```'
      echo

      index=$((index + 1))
    done < <(jq -c '.[]' <<<"$findings_json")
  } >"$output_path"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --pr)
      PR_NUMBER="$2"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="$2"
      shift 2
      ;;
    --bots)
      BOTS="$2"
      shift 2
      ;;
    --wait-minutes)
      WAIT_MINUTES="$2"
      shift 2
      ;;
    --poll-seconds)
      POLL_SECONDS="$2"
      shift 2
      ;;
    --min-comments)
      MIN_COMMENTS="$2"
      shift 2
      ;;
    --include-issue-comments)
      INCLUDE_ISSUE_COMMENTS=1
      shift
      ;;
    --no-issue-comments)
      INCLUDE_ISSUE_COMMENTS=0
      shift
      ;;
    --max-body-chars)
      MAX_BODY_CHARS="$2"
      shift 2
      ;;
    --full-body)
      COMPACT_MODE=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      log "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

require_command gh
require_command jq

if ! gh auth status >/dev/null 2>&1; then
  log "GitHub CLI is not authenticated. Run: gh auth login"
  exit 1
fi

if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
fi

if [[ -z "$PR_NUMBER" ]]; then
  PR_NUMBER="$(gh pr view --json number -q .number 2>/dev/null || true)"
fi

if [[ -z "$REPO" ]]; then
  log "Could not auto-detect repository. Pass --repo owner/repo"
  exit 1
fi

if [[ -z "$PR_NUMBER" ]]; then
  log "Could not auto-detect pull request number. Pass --pr <number>"
  exit 1
fi

if ! is_number "$WAIT_MINUTES"; then
  log "--wait-minutes must be a number"
  exit 1
fi

if ! is_number "$POLL_SECONDS" || [[ "$POLL_SECONDS" -eq 0 ]]; then
  log "--poll-seconds must be a number greater than 0"
  exit 1
fi

if ! is_number "$MIN_COMMENTS" || [[ "$MIN_COMMENTS" -eq 0 ]]; then
  log "--min-comments must be a number greater than 0"
  exit 1
fi

if ! is_number "$PR_NUMBER"; then
  log "--pr must be a numeric pull request number"
  exit 1
fi

if ! is_number "$MAX_BODY_CHARS"; then
  log "--max-body-chars must be a number"
  exit 1
fi

if [[ -z "$OUTPUT_PATH" ]]; then
  OUTPUT_PATH="$(resolve_output_path "$PR_NUMBER")"
fi

deadline_epoch="$(( $(date +%s) + (WAIT_MINUTES * 60) ))"
attempt=1
findings_json='[]'

while :; do
  log "Fetching bot comments from ${REPO}#${PR_NUMBER} (attempt ${attempt})"

  review_raw="$(fetch_endpoint_array "repos/${REPO}/pulls/${PR_NUMBER}/comments")"
  review_normalized="$(normalize_review_comments <<<"$review_raw")"

  issue_normalized='[]'
  if [[ "$INCLUDE_ISSUE_COMMENTS" -eq 1 ]]; then
    issue_raw="$(fetch_endpoint_array "repos/${REPO}/issues/${PR_NUMBER}/comments")"
    issue_normalized="$(normalize_issue_comments <<<"$issue_raw")"
  fi

  combined_json="$(jq -n --argjson review "$review_normalized" --argjson issue "$issue_normalized" '$review + $issue')"
  findings_json="$(filter_allowed_bots "$BOTS" <<<"$combined_json")"

  total_count="$(jq 'length' <<<"$combined_json")"
  total_review_count="$(jq '[.[] | select(.source == "pull_review_comment")] | length' <<<"$combined_json")"
  total_issue_count="$(jq '[.[] | select(.source == "pull_issue_comment")] | length' <<<"$combined_json")"
  findings_count="$(jq 'length' <<<"$findings_json")"
  matched_review_count="$(jq '[.[] | select(.source == "pull_review_comment")] | length' <<<"$findings_json")"
  matched_issue_count="$(jq '[.[] | select(.source == "pull_issue_comment")] | length' <<<"$findings_json")"

  log "Fetched: ${total_review_count} line + ${total_issue_count} issue comments"
  log "Matched: ${matched_review_count} line + ${matched_issue_count} issue comments"
  log "Matching comments: ${findings_count}"
  filtered_count=$((total_count - findings_count))
  if [[ "$filtered_count" -gt 0 ]]; then
    log "Filtered out by bot/source rules: ${filtered_count}"
  fi

  if [[ "$findings_count" -eq 0 ]]; then
    all_author_count="$(jq 'length' <<<"$combined_json")"
    if [[ "$all_author_count" -gt 0 ]]; then
      author_list="$(list_unique_authors "$combined_json" | tr '\n' ',' | sed 's/,$//')"
      if [[ -n "$author_list" ]]; then
        log "Found comment authors: ${author_list}"
      fi
    fi
  fi

  if [[ "$findings_count" -ge "$MIN_COMMENTS" ]]; then
    break
  fi

  if [[ "$WAIT_MINUTES" -eq 0 ]]; then
    break
  fi

  if [[ "$(date +%s)" -ge "$deadline_epoch" ]]; then
    log "Wait timeout reached (${WAIT_MINUTES} minute(s))."
    break
  fi

  sleep "$POLL_SECONDS"
  attempt=$((attempt + 1))
done

render_markdown "$OUTPUT_PATH" "$REPO" "$PR_NUMBER" "$BOTS" "$findings_json"
log "Wrote review findings to ${OUTPUT_PATH}"
