# Phase 2 — GitHub Intelligence
GitHub is an evidence provider, not the evaluator.
Collected signals: repository identity, default branch, commit SHA/message/author, PR state, merge status, base/head relationship, additions, deletions, changed-file count, and review decision.
Architecture: GitHub API -> normalized Evidence -> EvidenceBundle -> AgentRun -> deterministic evaluator.
Provider-specific fields remain inside Evidence.data. The evaluator never calls GitHub directly.
Security: tokens, installation credentials, and authorization headers must never enter persisted evidence.


## Deep collection (`collectGitHubIntelligence`)

`collectGitHubEvidence` returns the basic bundle (repository, commits, pull requests). `collectGitHubIntelligence` additionally collects, for a bounded number of recent items:

- workflow runs, jobs and steps (with durations), marking runs that look agent-driven and why;
- reviews and inline comments for recent pull requests;
- changed files per pull request, classified into canonical `diff` evidence (languages, test/config/generated/migration/infrastructure/auth/authorization/secrets files);
- issue events, used to detect reopened pull requests.

It also returns derived views: `ci` (success rate, retries, suspected flaky commits), `agentRuns`, and `pullRequests` (the Commit -> PR -> CI -> Review -> Merge lifecycle with any missing stages listed).

```ts
import { GitHubApiCollector, collectGitHubIntelligence } from "agentiq";

const collector = new GitHubApiCollector("owner/repo", { token: process.env.GITHUB_TOKEN });
const result = await collectGitHubIntelligence(collector, {
  maxWorkflowRuns: 50,
  maxPullRequestsDetailed: 10,
  agentBranchPrefixes: ["my-bot/"],
});
console.log(result.ci.successRate, result.pullRequests[0]?.decision, result.warnings);
```

Optional resources fail soft: if a token cannot read reviews, the failure is listed in `warnings` and everything else is still returned. A collector that only implements `repository`, `commits` and `pullRequests` keeps working.

Classification is path-based and never reads file contents, so treat the signals as pointers for review, not verdicts. Run duration is approximated from `created_at`/`updated_at` and is flagged `durationApproximate`.
