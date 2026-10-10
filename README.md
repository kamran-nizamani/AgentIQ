# AgentIQ

> **Measure AI coding agents by evidence, not hype.**

AgentIQ is an open-source, provider-neutral platform for evaluating how effectively AI coding agents actually perform software-engineering work.

It is designed to answer questions such as:

- Did the agent actually complete the task?
- Did the generated code pass tests?
- How much human intervention was required?
- How much time and money did the run consume?
- Did the agent create risky changes or require rollback?
- Which agent/model/configuration performs best on a real codebase?
- Is an agent improving over time?
- Can the evaluation be reproduced from evidence?

AgentIQ starts with a deterministic evaluation core and grows toward a complete **agent observability, benchmarking, auditing, and improvement platform**.

---

## Table of Contents

- [Vision](#vision)
- [Problem](#problem)
- [Goals](#goals)
- [Non-Goals](#non-goals)
- [Core Philosophy](#core-philosophy)
- [Product Overview](#product-overview)
- [Architecture](#architecture)
- [Evaluation Model](#evaluation-model)
- [Scoring System](#scoring-system)
- [Roadmap](#roadmap)
- [Phase 0 — Foundation](#phase-0--foundation)
- [Phase 1 — Evidence Ingestion](#phase-1--evidence-ingestion)
- [Phase 2 — GitHub Intelligence](#phase-2--github-intelligence)
- [Phase 3 — Evaluation Engine](#phase-3--evaluation-engine)
- [Phase 4 — Historical Analytics](#phase-4--historical-analytics)
- [Phase 5 — Agent Benchmarking](#phase-5--agent-benchmarking)
- [Phase 6 — Web Dashboard](#phase-6--web-dashboard)
- [Phase 7 — Agent Adapters](#phase-7--agent-adapters)
- [Phase 8 — Security and Safety](#phase-8--security-and-safety)
- [Phase 9 — AI-Assisted Analysis](#phase-9--ai-assisted-analysis)
- [Phase 10 — Benchmark Lab](#phase-10--benchmark-lab)
- [Phase 11 — Platform and Scale](#phase-11--platform-and-scale)
- [Phase 12 — Research Layer](#phase-12--research-layer)
- [Milestone Definition of Done](#milestone-definition-of-done)
- [Proposed Repository Structure](#proposed-repository-structure)
- [Data Flow](#data-flow)
- [API Direction](#api-direction)
- [CLI Direction](#cli-direction)
- [GitHub Integration](#github-integration)
- [Security Model](#security-model)
- [Testing Strategy](#testing-strategy)
- [Observability](#observability)
- [Contribution Strategy](#contribution-strategy)
- [Success Metrics](#success-metrics)
- [Long-Term Vision](#long-term-vision)
- [Development](#development)
- [License](#license)

---

## Vision

AI coding agents are becoming capable of writing code, fixing bugs, running tests, opening pull requests, and completing multi-step engineering tasks.

The difficult question is no longer:

> **"Can an AI agent write code?"**

The difficult question is:

> **"How reliably and efficiently can an AI agent perform real software engineering work?"**

AgentIQ aims to become the open evaluation layer for that question.

### North-star outcome

A developer should be able to connect a repository, run an AI coding agent, and receive:

1. A reproducible effectiveness score.
2. The evidence behind every score.
3. A safety and intervention report.
4. Historical performance trends.
5. Agent/model/configuration comparisons.
6. Actionable recommendations.
7. Optional qualitative analysis from an LLM.
8. Exportable evaluation data for research and benchmarking.

---

## Problem

Current AI coding-agent evaluation is fragmented.

A benchmark may tell us whether an agent solved a synthetic task, while an IDE or agent platform may report token usage or latency. Neither necessarily tells a team whether an agent is dependable inside its own production workflow.

AgentIQ focuses on **real engineering evidence**:

| Dimension | Example evidence |
|---|---|
| Outcome | success, partial completion, failure |
| Correctness | tests passed/failed |
| Code impact | files changed, lines added/deleted |
| Efficiency | duration, estimated cost |
| Autonomy | human interventions |
| Safety | rollback, risky changes |
| Reviewability | PR review outcome |
| Reliability | repeated task success |
| Maintainability | quality signals |
| Regression | post-change failures |

The platform should make every important metric traceable back to evidence.

---

## Goals

### Primary goals

- Build a provider-neutral evaluation format.
- Produce deterministic baseline scores.
- Ingest evidence from real coding-agent workflows.
- Integrate deeply with GitHub and CI/CD.
- Compare agents, models, prompts, and configurations.
- Preserve historical evaluation data.
- Detect regressions and reliability problems.
- Provide an explainable dashboard.
- Support optional LLM-based qualitative analysis.
- Make evaluation useful for both developers and researchers.

### Secondary goals

- Provide a CLI for local evaluation.
- Provide a stable API for integrations.
- Support self-hosting.
- Support multiple AI coding-agent providers.
- Export evaluation datasets.
- Enable reproducible research.
- Make new evidence sources pluggable.

---

## Non-Goals

AgentIQ is **not** intended to:

- Replace an AI coding agent.
- Become an IDE.
- Automatically merge code without explicit policy.
- Depend on one model provider.
- Treat an LLM-generated opinion as ground truth.
- hide the evidence behind a single unexplained score.
- optimize for benchmark numbers at the expense of real engineering reliability.

The platform evaluates agents; it does not need to become the agent itself.

---

## Core Philosophy

### 1. Evidence first

A score without evidence is not useful.

Every important evaluation result should be traceable to one or more observable signals.

### 2. Deterministic by default

Given the same normalized run evidence and scoring configuration, AgentIQ should produce the same deterministic score.

### 3. Provider neutral

AgentIQ should work with different coding agents, models, orchestration frameworks, and CI systems.

### 4. Explainable

A score should be decomposable into dimensions and individual signals.

### 5. Human-aware

Human intervention is not automatically bad. It is an observable part of the engineering workflow.

### 6. Safety-aware

An agent that completes a task by creating dangerous regressions should not receive the same evaluation as a safe, reviewable solution.

### 7. Extensible

New evidence types and adapters should be added without rewriting the core evaluator.

### 8. Reproducible

Evaluation inputs, scoring configuration, evaluator version, and evidence provenance should be recordable.

---

# Product Overview

AgentIQ is planned as five major layers:

```
┌─────────────────────────────────────────────────────────────┐
│                        AgentIQ UI                            │
│ Dashboard • Trends • Reports • Comparisons • Audit          │
├─────────────────────────────────────────────────────────────┤
│                    Analysis & Insights                       │
│ Recommendations • Qualitative AI • Regression Detection      │
├─────────────────────────────────────────────────────────────┤
│                    Evaluation Engine                         │
│ Scoring • Safety • Reliability • Quality • Benchmarking       │
├─────────────────────────────────────────────────────────────┤
│                     Evidence Layer                            │
│ GitHub • CI • Tests • PRs • Agent Logs • Telemetry            │
├─────────────────────────────────────────────────────────────┤
│                     Agent Adapters                            │
│ Generic • GitHub Actions • CLI • Agent-specific adapters      │
└─────────────────────────────────────────────────────────────┘
```

The most important architectural rule is:

> **Adapters collect evidence. The evaluation engine interprets evidence.**

This separation keeps the core independent from any single provider.

---

# Architecture

## High-level architecture

```
                  AI Coding Agent
                         │
                         ▼
                ┌─────────────────┐
                │ Agent Adapter   │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ Evidence        │
                │ Normalizer      │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ AgentRun        │
                │ Canonical Model │
                └────────┬────────┘
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
        Scoring      Safety      Reliability
             │           │           │
             └───────────┼───────────┘
                         ▼
                ┌─────────────────┐
                │ Evaluation      │
                │ Result          │
                └────────┬────────┘
                         │
             ┌───────────┼────────────┐
             ▼           ▼            ▼
         Dashboard    API/CLI     Export/Research
```

## Architectural boundaries

### Evidence layer

Responsible for collecting and normalizing facts.

Examples:

- GitHub Actions results.
- Pull request metadata.
- Test reports.
- Git diffs.
- Agent telemetry.
- Human interventions.
- CI failures.
- Rollbacks.

### Evaluation layer

Responsible for interpreting normalized evidence.

Examples:

- Outcome score.
- Test score.
- Efficiency score.
- Autonomy score.
- Safety score.
- Reliability score.

### Presentation layer

Responsible for showing results.

Examples:

- Dashboard.
- CLI output.
- JSON API.
- Markdown report.
- PR comment.

The evaluator must not depend on the dashboard.

---

# Evaluation Model

The canonical object is an `AgentRun`.

A run represents one attempt by an AI coding agent to complete an engineering task.

Conceptual model:

```ts
type AgentRun = {
  runId: string;

  task: {
    id?: string;
    description?: string;
    repository?: string;
    baseCommit?: string;
  };

  agent: {
    provider?: string;
    name?: string;
    version?: string;
  };

  model?: {
    provider?: string;
    name?: string;
    version?: string;
  };

  outcome: "success" | "partial" | "failure";

  tests: {
    total: number;
    passed: number;
    failed: number;
  };

  changes: {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
  };

  execution: {
    durationMs: number;
    estimatedCostUsd?: number;
  };

  humanIntervention: {
    required: boolean;
    interventions: number;
  };

  rollback?: boolean;
};
```

The exact schema will evolve, but compatibility and migration must be considered before breaking changes.

---

# Scoring System

The first scoring model is intentionally deterministic.

Current dimensions:

| Dimension | Weight |
|---|---:|
| Outcome | 35% |
| Tests | 30% |
| Efficiency | 15% |
| Autonomy | 10% |
| Safety | 10% |

```
Overall Score
    │
    ├── Outcome       35%
    ├── Tests         30%
    ├── Efficiency    15%
    ├── Autonomy      10%
    └── Safety        10%
```

The score is not intended to be a universal scientific truth.

It is a transparent baseline that can later support configurable evaluation policies and research-grade benchmark profiles.

## Current grades

| Score | Grade |
|---:|:---:|
| 90–100 | A |
| 80–89 | B |
| 70–79 | C |
| 60–69 | D |
| <60 | F |

## Future scoring profiles

Planned profiles include:

- Default engineering profile.
- Production safety profile.
- Autonomous-agent profile.
- Cost-sensitive profile.
- Reliability profile.
- Research benchmark profile.
- Custom organization profile.

The evaluator should eventually expose the scoring configuration used for every result.

---

# Roadmap

The roadmap is intentionally staged.

The order is important:

```
Foundation
   ↓
Evidence
   ↓
GitHub Intelligence
   ↓
Evaluation
   ↓
History
   ↓
Benchmarking
   ↓
Dashboard
   ↓
Adapters
   ↓
Security
   ↓
AI Analysis
   ↓
Benchmark Lab
   ↓
Scale
   ↓
Research
```

---

# Phase 0 — Foundation

**Status: 🟢 In progress / core implemented**

Goal: establish a clean, typed, deterministic foundation.

### Completed

- [x] TypeScript project bootstrap.
- [x] Typed `AgentRun` model.
- [x] Typed evaluation result.
- [x] Deterministic scoring engine.
- [x] Score breakdown.
- [x] Grade generation.
- [x] Recommendation generation.
- [x] Unit tests for scoring behavior.
- [x] Type checking.
- [x] Initial CI workflow.
- [x] Scoring documentation.

### Engineering principles

- Strict TypeScript.
- Small pure functions.
- No provider-specific logic inside scoring.
- Deterministic tests.
- Explicit types.
- Evidence-driven recommendations.

### Exit criteria

- [x] Evaluation core works without GitHub.
- [x] Same input produces same score.
- [x] Tests cover core scoring behavior.
- [x] CI validates the project.

---

# Phase 1 — Evidence Ingestion

**Status: 🟢 In progress**

Goal: turn real agent execution evidence into canonical `AgentRun` objects.

### GitHub Actions ingestion

- [ ] Parse workflow run metadata.
- [ ] Identify agent-related workflows.
- [x] Capture job status.
- [ ] Capture step status.
- [ ] Capture duration.
- [ ] Capture artifacts.
- [ ] Capture test reports.
- [x] Capture commit SHA.
- [x] Capture PR association.
- [x] Normalize CI evidence.

### Generic evidence ingestion

- [x] JSON evidence format.
- [x] Canonical TypeScript schema.
- [x] Runtime validation.
- [x] Evidence versioning.
- [x] Provenance metadata.
- [x] Timestamp normalization.
- [x] Source identifiers.
- [ ] Evidence confidence.

### Test evidence

- [ ] JUnit XML.
- [ ] Vitest/Jest output.
- [ ] Pytest output.
- [x] Generic test result adapter.
- [ ] Coverage evidence.
- [ ] Failure classification.

### Exit criteria

A GitHub Actions run should be convertible into a valid canonical `AgentRun` without changing the evaluator.

---

# Phase 2 — GitHub Intelligence

**Status: ⚪ Planned**

Goal: understand what happened to an agent-generated change inside a real GitHub repository.

### Repository analysis

- [ ] Repository metadata.
- [ ] Default branch.
- [ ] Base commit.
- [ ] Changed files.
- [ ] Diff statistics.
- [ ] Language breakdown.
- [ ] Test files changed.
- [ ] Configuration files changed.

### Pull request analysis

- [ ] PR metadata.
- [ ] Labels.
- [ ] Review count.
- [ ] Review decisions.
- [ ] Requested changes.
- [ ] Merge status.
- [ ] Time to merge.
- [ ] Reopened PR detection.
- [ ] CI history.

### Change risk signals

- [ ] Dependency changes.
- [ ] Authentication changes.
- [ ] Authorization changes.
- [ ] Secrets/configuration changes.
- [ ] Database migrations.
- [ ] Infrastructure changes.
- [ ] Large diffs.
- [ ] Generated files.
- [ ] Sensitive paths.

### Exit criteria

AgentIQ can explain the lifecycle:

```
Agent Run → Commit → PR → CI → Review → Merge
```

---

# Phase 3 — Evaluation Engine

**Status: 🟡 Planned expansion**

Goal: evolve the baseline score into a configurable evaluation framework.

### New dimensions

- [ ] Reliability.
- [ ] Maintainability.
- [ ] Regression risk.
- [ ] Reviewability.
- [ ] Change complexity.
- [ ] Task difficulty.
- [ ] Recovery behavior.
- [ ] Rework required.

### Configurable scoring

- [ ] Weight configuration.
- [ ] Scoring profiles.
- [ ] Threshold configuration.
- [ ] Organization policies.
- [ ] Versioned scoring policies.
- [ ] Backward-compatible scoring versions.

### Explainability

Every result should expose:

```
Score
 ├── dimension
 │    ├── raw evidence
 │    ├── normalized value
 │    ├── weight
 │    └── contribution
 └── recommendation
```

### Exit criteria

A user can answer:

> "Why did this run receive 73?"

without reading AgentIQ source code.

---

# Phase 4 — Historical Analytics

**Status: ⚪ Planned**

Goal: evaluate agents over time instead of judging isolated runs.

### Run history

- [ ] Persist evaluations.
- [ ] Query by repository.
- [ ] Query by agent.
- [ ] Query by model.
- [ ] Query by task.
- [ ] Query by date range.
- [ ] Query by branch.
- [ ] Query by PR.

### Trends

- [ ] Average score.
- [ ] Median score.
- [ ] Success rate.
- [ ] Test pass rate.
- [ ] Human intervention rate.
- [ ] Average duration.
- [ ] Estimated cost.
- [ ] Safety incidents.
- [ ] Regression rate.

### Statistical layer

- [ ] Sample size.
- [ ] Confidence intervals where appropriate.
- [ ] Variance.
- [ ] Outlier detection.
- [ ] Run-to-run stability.
- [ ] Agent performance distribution.

### Exit criteria

AgentIQ can show whether an agent is improving or degrading over time.

---

# Phase 5 — Agent Benchmarking

**Status: ⚪ Planned**

Goal: compare agents fairly on the same engineering tasks.

### Comparisons

- [ ] Agent vs agent.
- [ ] Model vs model.
- [ ] Prompt vs prompt.
- [ ] Configuration vs configuration.
- [ ] Version vs version.

### Benchmark controls

- [ ] Same repository.
- [ ] Same task.
- [ ] Same base commit.
- [ ] Same test suite.
- [ ] Same environment.
- [ ] Same scoring policy.

### Comparison output

```
                    Agent A     Agent B
Success Rate          82%         76%
Test Pass Rate        94%         88%
Median Score           86          79
Median Time           8m          11m
Human Intervention     12%         28%
Estimated Cost        $0.42       $0.71
```

### Exit criteria

Benchmark results must be reproducible and clearly distinguish raw evidence from derived metrics.

---

# Phase 6 — Web Dashboard

**Status: ⚪ Planned**

Goal: provide a production-quality interface for exploring evaluations.

### Dashboard areas

#### Overview

- [x] Overall score.
- [x] Success rate.
- [x] Test pass rate.
- [ ] Cost.
- [ ] Duration.
- [ ] Safety incidents.
- [ ] Recent runs.

#### Run details

- [x] Score.
- [x] Score breakdown.
- [ ] Evidence.
- [ ] Timeline.
- [ ] Changed files.
- [ ] Tests.
- [ ] Human interventions.
- [ ] Recommendations.

#### Trends

- [x] Score over time UI.
- [x] Cost over time UI.
- [x] Reliability over time UI.
- [ ] Agent comparison.
- [ ] Model comparison.

#### Audit

- [ ] Risk signals.
- [ ] Sensitive changes.
- [ ] Failed checks.
- [ ] Review feedback.
- [ ] Rollbacks.

### UX principle

The dashboard should answer:

> **What happened, why did it score this way, and what should I do next?**

---

# Phase 7 — Agent Adapters

**Status: ⚪ Planned**

Goal: make AgentIQ usable with different coding-agent ecosystems.

### Adapter contract

Conceptually:

```ts
interface AgentAdapter {
  identifyRun(input: unknown): AgentRun;
  collectEvidence(input: unknown): Evidence[];
}
```

### Planned adapter categories

- [ ] Generic JSON adapter.
- [ ] GitHub Actions adapter.
- [ ] CLI adapter.
- [ ] Local agent adapter.
- [ ] Open-source agent adapters.
- [ ] Provider-specific adapters.
- [ ] Custom organization adapters.

### Adapter requirements

Every adapter should:

- Normalize into canonical evidence.
- Preserve source provenance.
- Avoid modifying scoring behavior.
- Provide deterministic parsing where possible.
- Include fixtures and tests.

---

# Phase 8 — Security and Safety

**Status: ⚪ Planned**

Goal: ensure AgentIQ can safely observe software-engineering workflows without becoming a new attack surface.

### Security controls

- [ ] Least-privilege GitHub permissions.
- [ ] Token scope documentation.
- [ ] Secret redaction.
- [ ] Sensitive log filtering.
- [ ] PII minimization.
- [ ] Repository access boundaries.
- [ ] Audit logs.
- [ ] Secure webhook validation.
- [ ] Replay protection.
- [ ] Rate limiting.

### Agent safety signals

- [ ] Secret-file modifications.
- [ ] Permission changes.
- [ ] Auth changes.
- [ ] Dependency risk.
- [ ] Unsafe shell activity where observable.
- [ ] Destructive operations.
- [ ] Unexpected network activity where observable.
- [ ] Rollback detection.

### Security principle

AgentIQ must never require more repository access than is necessary to collect the evidence being evaluated.

---

# Phase 9 — AI-Assisted Analysis

**Status: ⚪ Planned**

Goal: use LLMs for qualitative reasoning without allowing them to silently control the deterministic score.

### AI analysis use cases

- [ ] Explain complex failures.
- [ ] Summarize PR review feedback.
- [ ] Classify failure causes.
- [ ] Identify repeated agent mistakes.
- [ ] Generate improvement suggestions.
- [ ] Summarize evaluation history.
- [ ] Detect recurring patterns.

### Critical architecture rule

```
Deterministic Evidence
        │
        ├──────────────► Deterministic Score
        │
        └──────────────► Optional LLM Analysis
                              │
                              ▼
                         Explanation /
                         Recommendation
```

The LLM should not silently override the deterministic evidence score.

### LLM safety

- [ ] Structured outputs.
- [ ] Schema validation.
- [ ] Prompt versioning.
- [ ] Model/version tracking.
- [ ] Confidence metadata.
- [ ] Evidence references.
- [ ] No unsupported claims.
- [ ] Optional local/private models.

---

# Phase 10 — Benchmark Lab

**Status: ⚪ Planned**

Goal: provide a reproducible environment for serious agent evaluation.

### Task suites

- [ ] Bug fixing.
- [ ] Feature implementation.
- [ ] Refactoring.
- [ ] Test generation.
- [ ] Documentation.
- [ ] Dependency upgrades.
- [ ] Performance optimization.
- [ ] Security fixes.
- [ ] Repository maintenance.

### Difficulty levels

- [ ] Easy.
- [ ] Medium.
- [ ] Hard.
- [ ] Expert.
- [ ] Multi-step.

### Benchmark metadata

Each task should define:

```
Task
 ├── repository
 ├── base commit
 ├── task description
 ├── expected behavior
 ├── tests
 ├── constraints
 └── evaluation policy
```

### Reproducibility

- [ ] Containerized environments.
- [ ] Pinned dependencies.
- [ ] Fixed base commits.
- [ ] Versioned tasks.
- [ ] Versioned scoring.
- [ ] Machine-readable results.
- [ ] Benchmark manifests.

---

# Phase 11 — Platform and Scale

**Status: ⚪ Planned**

Goal: move from a developer tool to a reliable multi-repository platform.

### Backend

- [ ] API service.
- [ ] Persistent database.
- [ ] Background jobs.
- [ ] Queue-based ingestion.
- [ ] Webhooks.
- [ ] Retry handling.
- [ ] Idempotent processing.

### Multi-tenancy

- [ ] Organizations.
- [ ] Projects.
- [ ] Repository membership.
- [ ] Role-based access control.
- [ ] API keys.
- [ ] Usage limits.

### Reliability

- [ ] Idempotency keys.
- [ ] Event deduplication.
- [ ] Retry policies.
- [ ] Dead-letter handling.
- [ ] Health checks.
- [ ] Database migrations.
- [ ] Backup strategy.

### Deployment

- [ ] Local development.
- [ ] Docker.
- [ ] Self-hosted deployment.
- [ ] Cloud deployment.
- [ ] Production CI/CD.

---

# Phase 12 — Research Layer

**Status: ⚪ Long-term**

Goal: make AgentIQ useful for academic and industry research into AI software engineering.

### Research capabilities

- [ ] Public benchmark datasets.
- [ ] Reproducible evaluation manifests.
- [ ] Experiment tracking.
- [ ] Statistical comparison.
- [ ] Ablation studies.
- [ ] Agent trajectory analysis.
- [ ] Failure taxonomy.
- [ ] Cost-quality analysis.
- [ ] Reliability analysis.

### Research questions

AgentIQ should eventually help investigate:

- Does a stronger model always produce better engineering outcomes?
- How much does tool access affect reliability?
- Which agents require the least human intervention?
- Which agents produce the safest changes?
- How does cost correlate with task success?
- Does longer reasoning improve correctness enough to justify its cost?
- Which failure modes repeat across agents?
- How does agent performance change across repository types?

### Potential outputs

- Benchmark reports.
- Research datasets.
- Evaluation papers.
- Reproducibility packages.
- Public leaderboards.

---

# Milestone Definition of Done

A feature is not considered complete merely because the code works locally.

Every significant milestone should satisfy:

### Code

- [ ] Type-safe implementation.
- [ ] Clear module boundaries.
- [ ] No unnecessary coupling.
- [ ] Error handling.
- [ ] Documentation.

### Tests

- [ ] Unit tests.
- [ ] Integration tests where applicable.
- [ ] Regression tests.
- [ ] Fixtures for external evidence.
- [ ] Edge cases.

### CI

- [ ] Typecheck.
- [ ] Tests.
- [ ] Linting when introduced.
- [ ] Build verification.
- [ ] Security checks where applicable.

### Observability

- [ ] Structured logs where needed.
- [ ] Useful error messages.
- [ ] Provenance tracking.
- [ ] Metrics for production components.

### Documentation

- [ ] README update.
- [ ] Architecture notes.
- [ ] API/schema documentation.
- [ ] Migration notes for breaking changes.

---

# Proposed Repository Structure

The repository is intentionally starting small. As the system grows, the target architecture is:

```
AgentIQ/
├── .github/
│   └── workflows/
│
├── apps/
│   ├── web/                 # React + Vite dashboard
│   └── api/                 # API service
│
├── packages/
│   ├── core/                # Canonical types
│   ├── evaluator/           # Deterministic evaluation
│   ├── evidence/            # Evidence normalization
│   ├── adapters/            # Agent/source adapters
│   ├── github/              # GitHub integration
│   ├── benchmark/           # Benchmark engine
│   ├── security/            # Safety/risk analysis
│   └── sdk/                 # Public developer SDK
│
├── cli/
│   └── agentiq/             # CLI
│
├── docs/
│   ├── architecture/
│   ├── scoring/
│   ├── adapters/
│   ├── benchmarks/
│   └── research/
│
├── examples/
│   ├── github-actions/
│   ├── local-run/
│   └── custom-adapter/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── fixtures/
│   └── benchmarks/
│
├── package.json
├── tsconfig.json
└── README.md
```

This structure should be introduced incrementally rather than creating empty folders prematurely.

---

# Data Flow

The target end-to-end flow:

```
1. Agent starts task
        │
        ▼
2. Agent modifies repository
        │
        ▼
3. Tests / CI execute
        │
        ▼
4. GitHub / adapter collects evidence
        │
        ▼
5. Evidence normalizer
        │
        ▼
6. Canonical AgentRun
        │
        ▼
7. Deterministic evaluator
        │
        ├── Score
        ├── Breakdown
        └── Recommendations
        │
        ▼
8. Historical store
        │
        ├── Trends
        ├── Comparisons
        └── Regression detection
        │
        ▼
9. Optional AI analysis
        │
        ▼
10. Dashboard / API / CLI / Report
```

---

# API Direction

The future API should be resource-oriented.

Possible endpoints:

```
POST   /v1/runs
GET    /v1/runs
GET    /v1/runs/:id
GET    /v1/runs/:id/evidence
GET    /v1/runs/:id/evaluation

GET    /v1/repositories
GET    /v1/repositories/:id/runs
GET    /v1/repositories/:id/trends

GET    /v1/agents
GET    /v1/models

POST   /v1/benchmarks
GET    /v1/benchmarks/:id
POST   /v1/benchmarks/:id/runs

GET    /v1/comparisons
```

API design must remain versioned and backward compatible.

---

# CLI Direction

A future CLI may provide:

```bash
# Evaluate a local evidence file
agentiq evaluate run.json

# Show a run
agentiq runs show <run-id>

# Compare agents
agentiq compare agent-a agent-b

# Analyze a repository
agentiq audit .

# Export results
agentiq export --format json

# Validate evidence
agentiq validate evidence.json
```

The CLI should remain useful without requiring the web dashboard.

---

# GitHub Integration

GitHub is a first-class integration because it provides rich engineering evidence.

Target workflow:

```
GitHub Repository
      │
      ├── Issue / Task
      │
      ├── Agent Run
      │
      ├── Commit
      │
      ├── Pull Request
      │
      ├── CI
      │
      ├── Reviews
      │
      └── Merge / Rollback
               │
               ▼
            AgentIQ
```

Future GitHub features:

- [ ] GitHub App.
- [ ] Webhook ingestion.
- [ ] PR checks.
- [ ] PR score comment.
- [ ] Repository audit.
- [ ] Historical repository analytics.
- [ ] Agent run linking.
- [ ] CI evidence collection.
- [ ] Review outcome ingestion.
- [ ] Optional status checks.

A future PR could show:

```
AgentIQ Evaluation

Score: 87 / 100
Grade: B

✓ Task completed
✓ 94% tests passed
✓ No rollback
⚠ Human intervention required

Top recommendation:
Improve test coverage before merge.
```

---

# Security Model

AgentIQ will operate around potentially sensitive source code and agent telemetry.

Security must therefore be designed from the beginning.

## Principles

- Least privilege.
- Explicit consent.
- Minimal data collection.
- Secret redaction.
- Data provenance.
- Tenant isolation.
- Secure defaults.
- Auditable actions.

## Sensitive data categories

Potentially sensitive:

- Source code.
- Repository metadata.
- Git history.
- Agent prompts.
- Agent logs.
- Environment information.
- CI output.
- File paths.
- User identities.
- Cost information.

AgentIQ should allow organizations to configure what evidence is retained.

---

# Testing Strategy

Testing will exist at multiple levels.

## Unit tests

Pure logic:

- Scoring.
- Normalization.
- Parsers.
- Risk calculations.
- Recommendation rules.

## Integration tests

External boundaries:

- GitHub API.
- Webhooks.
- CI artifacts.
- Database.
- Queue.

## Contract tests

Adapters must satisfy a common contract.

## Regression tests

Every discovered production bug should ideally become a regression fixture.

## Benchmark tests

Evaluation behavior itself should be tested against known datasets.

---

# Observability

Production components should expose:

### Logs

Structured events such as:

```json
{
  "event": "evaluation.completed",
  "runId": "run_123",
  "score": 84,
  "durationMs": 12000
}
```

### Metrics

Potential metrics:

- `agentiq_runs_total`
- `agentiq_evaluations_total`
- `agentiq_evaluation_duration_ms`
- `agentiq_score_distribution`
- `agentiq_ingestion_failures_total`
- `agentiq_webhook_latency_ms`

### Tracing

Future distributed components should support request and evaluation trace IDs.

---

# Contribution Strategy

AgentIQ should remain approachable for contributors while maintaining engineering quality.

## Contribution areas

Good contribution categories:

- Evidence adapters.
- Test parsers.
- GitHub integration.
- Scoring dimensions.
- Security checks.
- CLI commands.
- Dashboard components.
- Documentation.
- Benchmark tasks.
- Research tooling.

## Contributor workflow

```
Issue
  ↓
Design / discussion
  ↓
Implementation
  ↓
Tests
  ↓
CI
  ↓
Review
  ↓
Merge
```

Every non-trivial feature should have a clear reason to exist and evidence that it works.

---

# Success Metrics

AgentIQ should eventually measure its own adoption and quality.

## Product metrics

- Number of repositories evaluated.
- Number of agent runs.
- Number of active users.
- Number of integrations.
- Number of contributors.
- Number of benchmark tasks.

## Technical metrics

- Evaluation latency.
- Ingestion success rate.
- Parser accuracy.
- API reliability.
- Test coverage.
- Mean time to recovery.

## Evaluation quality metrics

- Reproducibility.
- Evidence completeness.
- Score stability.
- False-positive rate.
- False-negative rate.
- Benchmark consistency.

---

# Long-Term Vision

The long-term goal is not just a dashboard.

AgentIQ should become an **open evaluation infrastructure layer for AI software engineering**.

The ideal ecosystem looks like:

```
                   ┌─────────────────────┐
                   │   AI Coding Agents  │
                   └──────────┬──────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │     AgentIQ      │
                    │ Evaluation Layer │
                    └────────┬─────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
      Developers          Teams             Researchers
          │                  │                  │
          ▼                  ▼                  ▼
      Better agents     Safer workflows    Reproducible
      Better configs    Lower cost         benchmarks
      Better prompts    Higher reliability  datasets
```

The final product should make it possible to move from:

> **"This AI agent looks impressive."**

to:

> **"Here is the evidence. Here is the score. Here is how it compares. Here is where it fails. Here is what we should improve."**

---

# Development

## Requirements

- Node.js 22+
- npm

## Install

```bash
npm install
```

## Run the full application

Install dependencies, then start the API and frontend together:

```bash
npm install
npm run dev
```

The dashboard is available at `http://localhost:5173`; Vite proxies `/api/*` to the local API on `http://127.0.0.1:8787`.

For separate processes, use `npm run api:dev` and `npm run web:dev`. The API persists run history in SQLite (`./data/agentiq.sqlite`) and supports authenticated collection of GitHub Actions workflow/job evidence. See [`apps/api/README.md`](apps/api/README.md) for environment setup and security notes.

## Run tests

```bash
npm test
```

## Typecheck

```bash
npm run typecheck
```

## Development principles

Before adding a feature:

1. Define the problem.
2. Identify the evidence required.
3. Define the canonical data model.
4. Keep provider-specific code at the boundary.
5. Add tests.
6. Document behavior.
7. Update the roadmap.
8. Verify CI.

---

# Project Status

AgentIQ now includes SQLite-backed run history and an authenticated endpoint for collecting GitHub Actions workflow/job evidence. Broader test-result and diff ingestion still require additional evidence adapters.

### Current

- [x] Typed evaluation core
- [x] GitHub REST API collector
- [x] Deterministic scoring
- [x] Score breakdown
- [x] Recommendations
- [x] Unit tests
- [x] Type checking
- [x] Initial CI
- [x] Scoring documentation

### Next

- [x] Canonical evidence schema
- [x] GitHub Actions ingestion
- [x] Test-result ingestion
- [x] Git diff evidence
- [x] PR lifecycle evidence
- [x] Persistent run history (SQLite)
- [x] Evaluation/run-history API
- [x] Dashboard API integration
- [x] GitHub Actions workflow/job ingestion endpoint

### Guiding rule

> **Do not build the dashboard before the evidence model is stable.**

The quality of AgentIQ depends more on its evidence and evaluation model than on its UI. The dashboard is being built as a thin presentation layer so the same interface can later consume the canonical API without moving evaluation logic into React.

---

# License

License to be finalized as the project matures.

---

## AgentIQ

**Evidence → Evaluation → Insight → Improvement**

Build the measurement layer for AI-powered software engineering.


## Phase 2 — GitHub Intelligence

- [x] Repository metadata evidence
- [x] Commit identity/message evidence
- [x] Pull request lifecycle evidence
- [x] Review decision evidence
- [x] GitHub API collector
- [ ] CI/workflow history collector
- [ ] Review/comment evidence collector
- [ ] Risk signal extraction
