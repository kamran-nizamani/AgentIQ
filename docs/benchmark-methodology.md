# Benchmark methodology and interpretation

AgentIQ currently supports **descriptive score summaries** for groups of agent evaluations. These summaries help explore observed results; they do not, by themselves, establish that one agent is causally better than another.

## Current summary fields

- **Average and median score** describe central performance.
- **Score standard deviation** describes variation across observed runs; it is a population standard deviation for the supplied run set.
- **Minimum and maximum score** show the observed range.
- **Score-threshold rate** is the percentage of evaluations scoring at least 60/100. The legacy API field is named `successRate`, but it is not a direct measurement of task completion or test pass rate.
- **Sample-size label** is `single-run` for one evaluation, `small-sample` for two to four, and `multi-run` for five or more. Entries with fewer than five observations are marked provisional.
- **Rank** is descriptive and deterministic: average score, then score-threshold rate, then lower variation, then agent ID.

## What this does not prove

- Five runs is a display threshold, not a statistical power guarantee.
- A lower standard deviation does not mean an agent is safer or more correct.
- Comparing unrelated tasks, repositories, base commits, test suites, environments, or scoring policies is not a controlled benchmark.
- Missing test or safety evidence must not be treated as a successful outcome.
- Results should not be advertised as a leaderboard until comparable task definitions, repeated trials, evidence provenance, and policy versions are recorded.

## Requirements for a controlled benchmark

Before treating a comparison as a benchmark, store and compare the same task identifier, repository and base commit, test-suite version, environment, model/version, agent configuration, scoring policy version, and evidence provenance. Report failures and missing evidence, not only the mean score. Preserve raw run-level results so others can reproduce the aggregate.
