# AgentIQ Roadmap

This file is the working roadmap: what exists, what does not, and what to build next. The [README](README.md) describes the full 12-phase vision; this document reconciles that vision with the code as it stands.

Statuses below were checked against the source and tests, not copied from the README. Where a phase has not been audited item by item, it says so.

_Last reconciled: 2026-11-09, on the `feat/roadmap-and-phase-1-2` branch._

## Where the project stands

| Phase | Name | Status | Basis |
|------:|------|--------|-------|
| 0 | Foundation | Done | Scoring core, types, tests, CI. All 15 README items are ticked and the test suite and typecheck pass. |
| 1 | Evidence Ingestion | Done in the library | Workflow/job/step evidence with durations, agent-workflow identification, JUnit/Jest/Vitest/pytest parsing, coverage (LCOV, Istanbul summary, Cobertura), failure classification, evidence confidence. |
| 2 | GitHub Intelligence | Done in the library, not yet surfaced | `collectGitHubIntelligence` gathers CI history, reviews, comments, changed files and PR lifecycle. The HTTP API and dashboard do not call it yet (see M1). |
| 3 | Evaluation Engine | Not started | None of the 14 README items exist. Scoring has five fixed dimensions (outcome, tests, efficiency, autonomy, safety) and a weight policy. |
| 4 | Historical Analytics | Partial, not audited | `analytics.ts` (summaries, trends), `storage.ts` (in-memory run store), a Supabase durable store. No query API by repo/agent/model/branch/PR. |
| 5 | Agent Benchmarking | Partial, not audited | `benchmark.ts` ranking and `controlled-benchmark.ts` comparison with a controlled-benchmark API. README itself says controlled comparisons are incomplete. |
| 6 | Web Dashboard | Partial, not audited | Run list, run detail, intelligence and remediation views exist. README ticks 8 of 25 items. |
| 7-12 | Adapters, Security, AI analysis, Benchmark Lab, Platform, Research | Not started | Only a `FunctionAgentAdapter` exists for Phase 7. |

Health at this commit: 160 tests pass, `tsc` is clean for the library. The web and API packages are checked separately (see "Verification").

## What this branch delivered (Phases 1-2)

New library modules, each with tests:

- `change-analysis.ts`: classifies changed files by path into test, config, generated, migration, infrastructure, dependency, auth, authorization and secrets files; language breakdown; "production source changed with no test change" detection; packages the result as canonical diff evidence.
- `ci-intelligence.ts`: run/job durations, per-step evidence, agent-workflow identification (returns the matching signals so a person can see why), and CI history (success rate, retries, per-workflow stats, suspected flaky commits).
- `pr-lifecycle.ts`: Commit -> PR -> CI -> Review -> Merge timeline, review decision derived the way GitHub does, time to first review and to merge, reopen detection, and an explicit list of stages with no evidence.
- `evidence-confidence.ts`: deterministic 0..1 confidence per evidence item and per bundle, with reasons.
- `test-analysis.ts`: coverage parsing and evidence, failure classification, JUnit failure extraction.
- `risk.ts`: new signal categories (auth, authorization, secrets/config, migration, infrastructure, generated files, untested change).
- `GitHubApiCollector`: PR labels, draft flag, author and merger, changed files, issue events (for reopen detection), workflow-run actor.
- `collectGitHubIntelligence`: one call that gathers all of the above, tolerates partial failure (a 403 on reviews becomes a warning, not a crash), and has bounds on how much detail it fetches.

## Known limits of this work

Stated plainly so they are not mistaken for finished:

1. **Not validated against live GitHub.** All collector tests use recorded-shape fixtures. A run against a real repository is the first thing to do.
2. **Run duration is approximate.** It is `updated_at - created_at`, which includes queue time. The evidence says so (`durationApproximate`). Job duration is exact.
3. **Step durations are not captured.** The collector does not read step `started_at`/`completed_at`.
4. **Path-based classification is heuristic.** It never reads file contents, so a file named `session.ts` that has nothing to do with login is still flagged. Signals say which paths triggered them.
5. **Agent-workflow identification is keyword-based.** It will miss agents with unfamiliar names and can be tuned with `extraKeywords` and `extraBranchPrefixes`.
6. **Not wired into the product.** The dashboard and HTTP API still use the older `server/github-live.ts` path. It has its own copy of sensitive-path logic, which should be replaced by `classifySensitivePath`.
7. **Lifecycle starts at the commit.** The "Agent Run" stage needs an adapter that records which run produced which commit (Phase 7).
8. **Evidence confidence is advisory.** It does not change any score yet.

## Next milestones

Order is by dependency and value. Sizes are my estimates (S = days, M = about 1-2 weeks, L = several weeks), not commitments.

### M1 - Surface Phase 2 in the product (M)
Highest value, because it makes finished work visible.
- Add an API route returning `GitHubIntelligence` for a repository, with the same auth and caching rules as the existing intelligence route.
- Replace the duplicated sensitive-path logic in `server/github-live.ts` with `change-analysis`.
- Show on the dashboard: CI success rate and flaky commits, PR lifecycle with missing stages, new risk categories, and evidence confidence.
- Parse step `started_at`/`completed_at` and add step durations.
- **Done when:** a real repository shows CI history, PR lifecycle and the new risk signals in the dashboard, and the collector has been run against live GitHub in a test or manual check.

### M2 - Evaluation Engine, Phase 3 (L)
- Add scoring dimensions: reliability, maintainability, regression risk, reviewability, change complexity, task difficulty, recovery behavior, rework. Start with the ones the new evidence already supports (reviewability from lifecycle, regression risk from CI history and risk signals, change complexity from change analysis).
- Make weights, thresholds and profiles configurable; version scoring policies and keep old versions reproducible.
- Feed evidence confidence into the score status (for example, "verified" requires no low-confidence evidence).
- **Done when:** the same evidence scored under two policy versions gives documented, reproducible results, and old stored scores still re-evaluate identically.

### M3 - Historical analytics, Phase 4 (M)
- Query API over stored evaluations by repository, agent, model, task, date range, branch and PR, backed by the existing Supabase store.
- Statistics: median, variance, sample size, confidence intervals, outlier detection, run-to-run stability.
- **Done when:** a query for "agent X on repository Y over 30 days" returns metrics with sample sizes, and small samples are labelled rather than presented as trends.

### M4 - Controlled benchmarking, Phase 5 (M)
- Enforce the controls the README lists: same repository, task, base commit, test suite, environment and scoring policy.
- Agent-vs-agent, model-vs-model and prompt-vs-prompt comparisons that refuse to compare runs whose controls differ.

### M5 - Agent adapters, Phase 7 (L)
- Adapters that record which agent produced which commit and PR, completing "Agent Run -> Commit". Start with one or two agents that leave a clear trail on GitHub.

### M6 - Security and safety, Phase 8 (L)
- Build on the new risk signals: secret detection in diffs, dependency vulnerability checks, permission-change review, an audit log.

### Later (Phases 9-12)
AI-assisted analysis, a benchmark lab, multi-tenant platform and research layer. These depend on M2-M5 producing trustworthy, reproducible data first, so they are deliberately not scheduled.

## Verification

Run before merging anything from this roadmap:

```bash
npm test               # library tests
npm run typecheck      # library
npm run api:typecheck  # API package
npm run web:typecheck  # dashboard
```

## Working agreements

- Evidence first: a signal must point at the evidence that produced it. Missing evidence is reported as missing, never filled in.
- Deterministic by default: same input, same output. Heuristics say which rule fired.
- Additive changes: new evidence fields are added, not renamed, so stored evidence keeps validating.
