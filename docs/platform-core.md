# AgentIQ Platform Core

This milestone extends the evidence-first core into a reusable platform foundation.

## Components

- **GitHub collector contract** — provider-facing interface for repositories, commits, and pull requests.
- **Risk extraction** — deterministic risk signals derived only from evidence.
- **Evaluation policies** — configurable, validated scoring weights while retaining the original deterministic evaluator.
- **Historical analytics** — average, best/worst, pass rate, and directional trend.
- **Benchmarking** — deterministic ranking of agents by average score and success rate.
- **Agent adapters** — provider-neutral adapter contract for mapping agent-native output into AgentRun.

## Boundary

Collectors and adapters never score a run. They produce normalized evidence or canonical runs. Evaluation consumes those normalized objects.

## Next production integrations

A concrete GitHub API implementation can satisfy GitHubCollector using Octokit or fetch without changing the evaluation engine. CI history, review threads, comments, artifacts, and job-level telemetry should be added as new evidence kinds rather than embedded into scoring logic.
