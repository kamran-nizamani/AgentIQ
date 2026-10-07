# GitHub CI and Review Intelligence

AgentIQ models workflow runs, jobs, steps, reviews, and comments as first-class evidence.

GitHub responses are normalized before evaluation. Collection must not directly change scoring.

- `workflow-run`: status, conclusion, commit, event, run number
- `workflow-job`: job status/conclusion, runner, timestamps, steps
- `review`: reviewer state and timestamp
- `comment`: PR discussion with optional file/line location
