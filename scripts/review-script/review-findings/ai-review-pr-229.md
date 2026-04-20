# AI Review Findings

- Generated: 2026-04-19 15:28:57 UTC
- Repo: Puneet-Pal-Singh/shadowbox
- PR: #229
- Bots: coderabbitai,greptile-apps,codex
- Findings: 3
- Body mode: compact (1200 chars max per comment)
- Included: line comments only

## 1. [coderabbitai[bot]] apps/secure-agent-api/src/plugins/GitHubPlugin.ts:220

- Source: pull_review_comment
- Created: 2026-04-19T15:07:05Z
- URL: https://github.com/Puneet-Pal-Singh/shadowbox/pull/229#discussion_r3107028244

```markdown
_⚠️ Potential issue_ | _🟡 Minor_

**Review-thread grouping silently truncates at 100 comments.**

`?per_page=100` with no pagination means PRs with >100 review comments will return incomplete threads and possibly orphaned replies whose root parent was paginated out. At minimum signal truncation in the output so the LLM knows not to treat the thread list as exhaustive, or paginate via `Link` headers.


<details>
<summary>💡 Minimal truncation signal</summary>

```diff
     return {
       success: true,
       output: JSON.stringify({
         pullRequestNumber: number,
         threadCount: grouped.size,
+        truncated: comments.length >= 100,
         threads: Array.from(grouped.values()),
       }),
     };
```
</details>


<details>
<summary>🤖 Prompt for AI Agents</summary>

```
Verify each finding against the current code and only fix it if needed.

In `@apps/secure-agent-api/src/plugins/GitHubPlugin.ts` around lines 158 - 220,
The current getReviewThreads fetch uses a single request with `?per_page=100`
and may truncate results; update getReviewThreads to fully paginate review
comments (follow GitHub Link headers or repeatedly call requestGitHub with
page=1..n until no more

[truncated]
```

## 2. [coderabbitai[bot]] apps/secure-agent-api/src/plugins/GitHubPlugin.ts:310

- Source: pull_review_comment
- Created: 2026-04-19T15:07:06Z
- URL: https://github.com/Puneet-Pal-Singh/shadowbox/pull/229#discussion_r3107028247

```markdown
_⚠️ Potential issue_ | _🟠 Major_

**Add a timeout/`AbortSignal` to the GitHub fetch.**

`fetch` has no timeout, so a slow or hung GitHub response (or sandbox-side network stall) will block the plugin indefinitely and burn through the agentic loop's step/time budget without a classifiable failure. External calls on request threads should always have a bounded deadline.


<details>
<summary>🔧 Proposed fix — bounded timeout with AbortSignal</summary>

```diff
+const GITHUB_REQUEST_TIMEOUT_MS = 15_000;
+
   private async requestGitHub<T>(
     token: string,
     path: string,
     init: GitHubRequestInit = {},
   ): Promise<T> {
-    const response = await fetch(`https://api.github.com${path}`, {
-      method: init.method ?? "GET",
-      headers: {
-        Authorization: `Bearer ${token}`,
-        Accept: "application/vnd.github+json",
-        "User-Agent": "Shadowbox-GitHub-Connector/0.1.0",
-        "X-GitHub-Api-Version": "2022-11-28",
-      },
-    });
+    const controller = new AbortController();
+    const timeoutId = setTimeout(
+      () => controller.abort(),
+      GITHUB_REQUEST_TIMEOUT_MS,
+    );
+    let response: Response;
+    try {
+      response = await fetch

[truncated]
```

## 3. [coderabbitai[bot]] packages/execution-engine/src/runtime/engine/RunEngine.ts:1044

- Source: pull_review_comment
- Created: 2026-04-19T15:07:06Z
- URL: https://github.com/Puneet-Pal-Singh/shadowbox/pull/229#discussion_r3107028249

```markdown
_⚠️ Potential issue_ | _🟠 Major_

**`hasGitHubAuth` proxy is too loose — presence of a user id ≠ GitHub connector token.**

`Boolean(run.metadata.actorUserId ?? this.options.userId)` is always truthy for authenticated users regardless of whether they've connected GitHub. `GitHubTaskStrategy` will then route `remote_metadata` / `hybrid_pr_ci` requests to `github_connector` as the preferred lane, which downstream fails at `apps/brain/src/services/ExecutionService.ts` (no token to inject) or at `GitHubPlugin.execute` with `"GitHub token is required for connector metadata actions."`. The strategy should reflect actual GitHub credential availability (e.g., resolvable stored token) so failing runs get steered to `shell_gh` / connector-gap lanes instead.

Consider threading a `hasGitHubAuth` resolver through `RunEngineDependencies` (e.g., a `GitHubTokenAvailabilityChecker`) and calling it here, so the decision reflects real auth state rather than session presence.




```shell
#!/bin/bash
# Confirm there's no existing abstraction that checks GitHub token availability by user id
rg -nP --type=ts -C3 '\b(hasGitHubToken|githubTokenFor|getGitHubToken|resolveGitHubToken)\b'
```

<details>
<sum

[truncated]
```

