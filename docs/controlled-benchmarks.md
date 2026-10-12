# Controlled benchmark cohorts

The core API `compareControlledBenchmarks` compares agent configurations only when all of these values match exactly:

- Task ID
- Repository
- Base commit SHA
- Test-suite version
- Environment fingerprint
- Scoring-policy version

Different control values produce separate cohorts. The function never silently mixes runs from different bases or test environments.

Each agent/configuration summary reports observed average and median score, score spread, actual task-success rate (from the recorded `taskOutcome`), and optional mean duration, cost, and test pass rate. It marks results provisional when an agent configuration has fewer than five runs. A cohort with fewer than two configurations is not described as a head-to-head comparison.

This is still descriptive analytics: it does not calculate statistical significance, adjust for task difficulty, or establish causal superiority. Callers must preserve raw run IDs and trustworthy evidence provenance. Do not populate outcome, cost, or test metrics from guesses or missing evidence.
