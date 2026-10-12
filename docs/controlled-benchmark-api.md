# Controlled benchmark comparison API

AgentIQ exposes a stateless endpoint at `POST /api/benchmarks` for comparing supplied agent-run evidence with the same deterministic cohort rules used by the core library.

## Request

Send JSON with a `runs` array. Each run must include:

- `runId`, `agentId`, `modelId`, and `configId`
- `taskId`, `repository`, `baseCommitSha`
- `testSuiteVersion`, `environmentFingerprint`, and `policyVersion`
- `taskOutcome`: `success`, `partial`, or `failure`
- `evaluation.score`: a finite number from 0 to 100

Optional metrics are `durationMs`, `costUsd`, and `testPassRate` (0–100). The core comparator validates ranges and rejects duplicate run IDs. The request is limited to 500 runs and 1 MB.

```bash
curl -X POST https://agent-iq-nu.vercel.app/api/benchmarks \
  -H 'content-type: application/json' \
  --data-binary @controlled-runs.json
```

Example shape:

```json
{
  "runs": [
    {
      "runId": "run-a-001",
      "agentId": "agent-a",
      "modelId": "model-x",
      "configId": "default",
      "taskId": "fix-parser",
      "repository": "owner/repo",
      "baseCommitSha": "a1b2c3d",
      "testSuiteVersion": "v1",
      "environmentFingerprint": "node22-linux",
      "policyVersion": "2026-10",
      "taskOutcome": "success",
      "evaluation": { "score": 84 },
      "durationMs": 12000,
      "costUsd": 0.04,
      "testPassRate": 100
    }
  ]
}
```

## Response and limitations

The response includes one comparison per exact control cohort, with per-configuration mean/median score, score spread, observed task-success rate, and available cost/duration/test metrics. Configurations with fewer than five runs are marked provisional.

- The endpoint is **stateless**: submitted records are processed in memory and are not stored.
- Do not submit secrets, source code, prompts, or personally identifying data.
- Keep run IDs and metrics tied to trustworthy raw evidence; the API cannot independently verify client-supplied claims.
- Comparisons are descriptive only. They do not establish statistical significance or causality.
- Different task, repository, base commit, test suite, environment, or policy values create separate cohorts and are never mixed.
