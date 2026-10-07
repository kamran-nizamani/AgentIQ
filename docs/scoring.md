# AgentIQ scoring model

AgentIQ's first evaluator is deliberately deterministic. It does not ask an LLM to decide whether an agent was effective.

## Dimensions

| Dimension | Weight | Evidence |
| --- | ---: | --- |
| Outcome | 35% | Task result: success, partial, or failure |
| Tests | 30% | Passed tests / total tests |
| Efficiency | 15% | Execution duration and estimated cost |
| Autonomy | 10% | Number of human interventions |
| Safety | 10% | Whether the run required a rollback |

The final score is the weighted sum of the five normalized dimensions and is rounded to the nearest integer.

## Why deterministic first?

A reproducible baseline lets AgentIQ compare agents and model configurations without introducing evaluator-model variance. Qualitative LLM analysis can be layered on top later, but it should not replace the evidence-backed baseline.

## Missing evidence

When no tests exist, the evaluator assigns a neutral test score of 50 rather than pretending that zero tests means zero quality.

When cost is unavailable, no cost penalty is applied.

## Next step

The next ingestion layer should map real GitHub Actions, pull-request, and coding-agent telemetry into the AgentRun schema without coupling the scoring engine to GitHub.
