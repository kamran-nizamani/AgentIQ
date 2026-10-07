# AgentIQ

AgentIQ is an open-source platform for measuring the effectiveness of AI coding agents.

## Current focus

The first milestone is a provider-neutral evaluation core. It turns an agent run into a reproducible score using explicit signals such as task outcome, test results, code changes, latency, cost, and human intervention.

## Roadmap

- [x] Bootstrap a typed evaluation model
- [x] Deterministic effectiveness scoring
- [x] Score breakdown and recommendations
- [ ] GitHub Actions run ingestion
- [ ] Pull request / repository audit
- [ ] Historical run comparison
- [ ] Web dashboard
- [ ] LLM-assisted qualitative analysis

## Design principles

- **Provider-neutral:** no lock-in to one AI model or coding agent.
- **Deterministic core:** the same run data must produce the same score.
- **Evidence-first:** scores are backed by observable run signals.
- **Extensible:** new signals can be added without rewriting the evaluator.

## Development

```bash
npm install
npm test
npm run typecheck
```

AgentIQ is under active development.
