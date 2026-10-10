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

The low-level `evaluateAgentRun` helper retains a neutral test score of 50 when the caller supplies no test cases. Production evidence-based evaluation is stricter: a test score is considered available only when a parsed `test-suite` report is attached, and a safety score is considered available only when code-diff evidence is attached.

If either evidence source is absent, AgentIQ marks the overall result **provisional**, lists the missing evidence, and excludes the unavailable dimension from the weighted sum. The remaining weights are renormalized to 100% for the displayed provisional score. The missing dimension is displayed as unavailable—not as a pass, zero, or a safe result. Scores with different evidence coverage should not be compared as if they had equal confidence.

When cost is unavailable, no cost penalty is applied.

## Next step

The next ingestion layer should map real GitHub Actions, pull-request, and coding-agent telemetry into the AgentRun schema without coupling the scoring engine to GitHub.
